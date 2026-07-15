import csv
import io
import secrets
import string
from datetime import timedelta
from functools import wraps

from flask import (
    Flask,
    Response,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from celery_app import init_celery
from config import Config
from models import (
    Admin,
    CashWallet,
    CustomerWallet,
    Order,
    Package,
    PaymentEvent,
    Reseller,
    Setting,
    WalletLedger,
    db,
    utcnow,
)
from services.customer_wallet import debit_wallet
from services.notifications import init_notification_defaults, notify_order_update
from services.payment_gateway import ingest_payment_message
from services.reseller_billing import credit_reseller, debit_reseller
from services.vodafone_validator import (
    normalize_egypt_mobile,
    validate_vodafone_customer,
)
from services.wallet_rotation import seed_cash_wallet_from_setting

STATUS_LABELS = {
    "verifying": "جاري التحقق من الحساب",
    "verification_failed": "فشل التحقق",
    "awaiting_payment": "انتظار الدفع",
    "payment_submitted": "تحويل مُسجَّل",
    "paid": "مدفوع",
    "fulfilled": "مُفعَّل",
    "activation_failed": "فشل التفعيل",
    "refunded_wallet": "مُسترد للمحفظة",
    "rejected": "مرفوض",
}


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    db.init_app(app)
    init_celery(app)

    with app.app_context():
        db.create_all()
        _migrate_sqlite_columns()
        _seed_defaults(app)
        init_notification_defaults(app)

    register_routes(app)
    return app


def _migrate_sqlite_columns() -> None:
    uri = str(db.engine.url)
    if not uri.startswith("sqlite"):
        return
    specs = {
        "packages": {
            "wholesale_price": "FLOAT",
        },
        "orders": {
            "whatsapp_number": "VARCHAR(20) DEFAULT ''",
            "account_password": "TEXT DEFAULT ''",
            "account_verified": "BOOLEAN DEFAULT 0",
            "verification_mode": "VARCHAR(20) DEFAULT ''",
            "verification_message": "TEXT DEFAULT ''",
            "verification_task_id": "VARCHAR(80) DEFAULT ''",
            "instapay_address": "VARCHAR(120) DEFAULT ''",
            "cash_wallet_id": "INTEGER",
            "reseller_id": "INTEGER",
            "customer_wallet_id": "INTEGER",
            "paid_from_wallet": "BOOLEAN DEFAULT 0",
            "fulfilled_at": "DATETIME",
            "renewal_at": "DATETIME",
            "reminder_sent": "BOOLEAN DEFAULT 0",
        },
        "payment_events": {
            "provider": "VARCHAR(40) DEFAULT 'unknown'",
            "transaction_ref": "VARCHAR(80) DEFAULT ''",
        },
    }
    with db.engine.begin() as conn:
        for table, columns in specs.items():
            try:
                existing = {
                    row[1]
                    for row in conn.exec_driver_sql(
                        f"PRAGMA table_info({table})"
                    ).fetchall()
                }
            except Exception:  # noqa: BLE001
                continue
            for col, typedef in columns.items():
                if col not in existing:
                    conn.exec_driver_sql(
                        f"ALTER TABLE {table} ADD COLUMN {col} {typedef}"
                    )


def _seed_defaults(app: Flask) -> None:
    admin = Admin.query.filter_by(username=app.config["ADMIN_USERNAME"]).first()
    if not admin:
        admin = Admin(username=app.config["ADMIN_USERNAME"])
        db.session.add(admin)
    # Keep configured admin credentials in sync with .env / defaults
    admin.set_password(app.config["ADMIN_PASSWORD"])

    defaults_settings = {
        "vodafone_cash_number": app.config["VODAFONE_CASH_NUMBER"],
        "instapay_address": app.config.get("INSTAPAY_ADDRESS") or "",
        "webhook_token": app.config["PAYMENT_WEBHOOK_TOKEN"],
    }
    for key, value in defaults_settings.items():
        if not Setting.query.filter_by(key=key).first():
            db.session.add(Setting(key=key, value=value))

    if Package.query.count() == 0:
        defaults = [
            Package(
                name="فودافون ريد 70",
                description="باقة فودافون ريد للمكالمات والإنترنت",
                price=70,
                wholesale_price=60,
                data_gb=7,
                minutes=1000,
                validity_days=30,
            ),
            Package(
                name="فودافون ريد 100",
                description="باقة فودافون ريد متوسطة",
                price=100,
                wholesale_price=85,
                data_gb=12,
                minutes=2000,
                validity_days=30,
            ),
            Package(
                name="فودافون ريد 150",
                description="باقة فودافون ريد كبيرة",
                price=150,
                wholesale_price=130,
                data_gb=25,
                minutes=4000,
                validity_days=30,
            ),
        ]
        db.session.add_all(defaults)

    db.session.commit()

    cash = get_setting(
        "vodafone_cash_number", app.config["VODAFONE_CASH_NUMBER"]
    )
    seed_cash_wallet_from_setting(cash)


def get_setting(key: str, default: str = "") -> str:
    row = Setting.query.filter_by(key=key).first()
    return row.value if row else default


def set_setting(key: str, value: str) -> None:
    row = Setting.query.filter_by(key=key).first()
    if row:
        row.value = value
    else:
        db.session.add(Setting(key=key, value=value))
    db.session.commit()


def make_reference() -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        ref = "VR-" + "".join(secrets.choice(alphabet) for _ in range(8))
        if not Order.query.filter_by(reference=ref).first():
            return ref


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin_id"):
            return redirect(url_for("admin_login"))
        return view(*args, **kwargs)

    return wrapped


def reseller_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("reseller_id"):
            return redirect(url_for("reseller_login"))
        return view(*args, **kwargs)

    return wrapped


def _fulfill_order(order: Order) -> None:
    order.status = "fulfilled"
    order.fulfilled_at = utcnow()
    days = order.package.validity_days if order.package else 30
    order.renewal_at = order.fulfilled_at + timedelta(days=days or 30)
    order.reminder_sent = False


def register_routes(app: Flask) -> None:
    # ---------- Customer ----------

    @app.route("/")
    def home():
        packages = (
            Package.query.filter_by(is_active=True).order_by(Package.price.asc()).all()
        )
        return render_template("customer/home.html", packages=packages)

    @app.route("/order", methods=["GET", "POST"])
    def start_order():
        packages = (
            Package.query.filter_by(is_active=True).order_by(Package.price.asc()).all()
        )
        selected_id = request.args.get("package_id", type=int)

        if request.method == "POST":
            from services.tasks import enqueue_verification

            name = (request.form.get("customer_name") or "").strip()
            number = request.form.get("vodafone_number") or ""
            whatsapp = request.form.get("whatsapp_number") or number
            national_id = (request.form.get("national_id") or "").strip()
            account_password = (request.form.get("account_password") or "").strip()
            package_id = request.form.get("package_id", type=int)
            use_wallet = request.form.get("use_wallet") == "1"

            ok, message, normalized = validate_vodafone_customer(number)
            package = Package.query.filter_by(id=package_id, is_active=True).first()
            wa_norm = normalize_egypt_mobile(whatsapp)

            errors = []
            if len(name) < 3:
                errors.append("اكتب الاسم بالكامل (3 حروف على الأقل).")
            if not ok:
                errors.append(message)
            if not wa_norm:
                errors.append("رقم واتساب غير صحيح.")
            if not package:
                errors.append("اختر باقة صحيحة من القائمة.")

            wallet = None
            if use_wallet and wa_norm:
                wallet = CustomerWallet.query.filter_by(phone=wa_norm).first()
                if not wallet or float(wallet.balance or 0) < float(package.price):
                    errors.append("رصيد المحفظة غير كافٍ لدفع هذه الباقة.")

            if errors:
                return render_template(
                    "customer/order.html",
                    packages=packages,
                    selected_id=package_id,
                    errors=errors,
                    form=request.form,
                )

            order = Order(
                reference=make_reference(),
                customer_name=name,
                vodafone_number=normalized,
                whatsapp_number=wa_norm,
                package_id=package.id,
                amount=package.price,
                pay_to_number="",
                instapay_address=get_setting(
                    "instapay_address", app.config.get("INSTAPAY_ADDRESS") or ""
                ),
                status="verifying",
                account_verified=False,
                customer_wallet_id=wallet.id if wallet else None,
            )
            order.national_id = national_id
            order.account_password = account_password
            db.session.add(order)
            db.session.commit()

            # Async verification (eager mode runs inline when configured)
            enqueue_verification(order.id)
            db.session.refresh(order)

            if use_wallet and wallet and order.status == "awaiting_payment":
                try:
                    debit_wallet(
                        wallet,
                        order.amount,
                        reason="pay_order",
                        order_id=order.id,
                    )
                    order.paid_from_wallet = True
                    order.customer_wallet_id = wallet.id
                    order.status = "paid"
                    order.payment_matched_at = utcnow()
                    db.session.commit()
                    notify_order_update(order, event="paid_from_wallet")
                    flash("تم الدفع من رصيد محفظتك.", "success")
                    return redirect(url_for("order_status", reference=order.reference))
                except ValueError as exc:
                    flash(str(exc), "error")

            notify_order_update(order, event="order_created")
            if order.status == "awaiting_payment":
                return redirect(url_for("payment_page", reference=order.reference))
            return redirect(url_for("order_status", reference=order.reference))

        return render_template(
            "customer/order.html",
            packages=packages,
            selected_id=selected_id,
            errors=[],
            form={},
        )

    @app.route("/validate-number", methods=["POST"])
    def validate_number_api():
        number = request.json.get("number", "") if request.is_json else ""
        ok, message, normalized = validate_vodafone_customer(number)
        return jsonify(ok=ok, message=message, normalized=normalized)

    @app.route("/api/order/<reference>/status")
    def order_status_api(reference):
        order = Order.query.filter_by(reference=reference).first_or_404()
        return jsonify(
            reference=order.reference,
            status=order.status,
            status_label=STATUS_LABELS.get(order.status, order.status),
            account_verified=order.account_verified,
            verification_message=order.verification_message,
            pay_to_number=order.pay_to_number,
            amount=order.amount,
        )

    @app.route("/pay/<reference>", methods=["GET", "POST"])
    def payment_page(reference):
        order = Order.query.filter_by(reference=reference).first_or_404()
        wallet = CustomerWallet.query.filter_by(
            phone=order.whatsapp_number or order.vodafone_number
        ).first()

        if order.status == "verifying":
            flash("جاري التحقق من الحساب في الخلفية…", "success")
            return redirect(url_for("order_status", reference=order.reference))

        if request.method == "POST":
            action = request.form.get("action") or "cash"
            if action == "wallet":
                if not wallet or float(wallet.balance or 0) < float(order.amount):
                    flash("رصيد المحفظة غير كافٍ.", "error")
                    return render_template(
                        "customer/payment.html", order=order, wallet=wallet
                    )
                debit_wallet(
                    wallet, order.amount, reason="pay_order", order_id=order.id
                )
                order.paid_from_wallet = True
                order.customer_wallet_id = wallet.id
                order.status = "paid"
                order.payment_matched_at = utcnow()
                db.session.commit()
                notify_order_update(order, event="paid_from_wallet")
                flash("تم الدفع من المحفظة الداخلية.", "success")
                return redirect(url_for("order_status", reference=order.reference))

            sender = request.form.get("sender_number") or ""
            normalized = normalize_egypt_mobile(sender)
            if not normalized:
                flash("رقم المحفظة/المحول غير صحيح.", "error")
                return render_template(
                    "customer/payment.html", order=order, wallet=wallet
                )

            order.sender_number = normalized
            if order.status == "awaiting_payment":
                order.status = "payment_submitted"
            db.session.commit()

            pending_events = (
                PaymentEvent.query.filter_by(matched=False)
                .order_by(PaymentEvent.created_at.desc())
                .limit(50)
                .all()
            )
            matched = False
            for event in pending_events:
                if event.sender_number == normalized and (
                    event.amount is None or abs(event.amount - order.amount) < 0.01
                ):
                    order.status = "paid"
                    order.payment_matched_at = utcnow()
                    event.matched = True
                    event.order_id = order.id
                    db.session.commit()
                    from services.wallet_rotation import record_wallet_receipt

                    record_wallet_receipt(order.cash_wallet_id, order.amount)
                    matched = True
                    notify_order_update(order, event="payment_matched")
                    break

            if not matched:
                notify_order_update(order, event="payment_submitted")

            flash("تم تسجيل رقم التحويل. جاري التحقق من الدفع تلقائياً.", "success")
            return redirect(url_for("order_status", reference=order.reference))

        return render_template("customer/payment.html", order=order, wallet=wallet)

    @app.route("/status/<reference>")
    def order_status(reference):
        order = Order.query.filter_by(reference=reference).first_or_404()
        wallet = None
        if order.customer_wallet_id:
            wallet = CustomerWallet.query.get(order.customer_wallet_id)
        elif order.whatsapp_number:
            wallet = CustomerWallet.query.filter_by(phone=order.whatsapp_number).first()
        return render_template(
            "customer/status.html",
            order=order,
            status_labels=STATUS_LABELS,
            wallet=wallet,
        )

    @app.route("/wallet", methods=["GET", "POST"])
    def customer_wallet_page():
        wallet = None
        ledger = []
        error = None
        phone = ""
        if request.method == "POST":
            phone = request.form.get("phone") or ""
            normalized = normalize_egypt_mobile(phone)
            if not normalized:
                error = "رقم الموبايل غير صحيح"
            else:
                wallet = CustomerWallet.query.filter_by(phone=normalized).first()
                if not wallet:
                    error = "لا توجد محفظة مرتبطة بهذا الرقم بعد"
                else:
                    ledger = (
                        wallet.ledger.order_by(WalletLedger.created_at.desc())
                        .limit(30)
                        .all()
                    )
        return render_template(
            "customer/wallet.html",
            wallet=wallet,
            ledger=ledger,
            error=error,
            phone=phone,
        )

    @app.route("/retry/<reference>", methods=["GET", "POST"])
    def retry_with_wallet(reference):
        """Use refunded wallet balance to place a new order for another number."""
        old = Order.query.filter_by(reference=reference).first_or_404()
        wallet = CustomerWallet.query.filter_by(
            phone=old.whatsapp_number or old.vodafone_number
        ).first()
        packages = (
            Package.query.filter_by(is_active=True).order_by(Package.price.asc()).all()
        )
        if request.method == "POST":
            from services.tasks import enqueue_verification

            number = request.form.get("vodafone_number") or ""
            package_id = request.form.get("package_id", type=int)
            ok, message, normalized = validate_vodafone_customer(number)
            package = Package.query.filter_by(id=package_id, is_active=True).first()
            errors = []
            if not wallet:
                errors.append("لا توجد محفظة متاحة")
            if not ok:
                errors.append(message)
            if not package:
                errors.append("اختر باقة")
            elif wallet and float(wallet.balance or 0) < float(package.price):
                errors.append("رصيد المحفظة غير كافٍ")
            if errors:
                return render_template(
                    "customer/retry.html",
                    order=old,
                    wallet=wallet,
                    packages=packages,
                    errors=errors,
                )

            new_order = Order(
                reference=make_reference(),
                customer_name=old.customer_name,
                vodafone_number=normalized,
                whatsapp_number=old.whatsapp_number,
                package_id=package.id,
                amount=package.price,
                pay_to_number="",
                instapay_address=old.instapay_address,
                status="verifying",
                customer_wallet_id=wallet.id,
            )
            new_order.national_id = old.national_id
            db.session.add(new_order)
            db.session.commit()
            enqueue_verification(new_order.id)
            db.session.refresh(new_order)
            if new_order.status == "awaiting_payment":
                debit_wallet(
                    wallet,
                    new_order.amount,
                    reason="retry_from_wallet",
                    order_id=new_order.id,
                )
                new_order.paid_from_wallet = True
                new_order.status = "paid"
                new_order.payment_matched_at = utcnow()
                db.session.commit()
                notify_order_update(new_order, event="retry_paid_wallet")
            return redirect(url_for("order_status", reference=new_order.reference))

        return render_template(
            "customer/retry.html",
            order=old,
            wallet=wallet,
            packages=packages,
            errors=[],
        )

    # ---------- Payment webhook ----------

    @app.route("/api/payment/webhook", methods=["POST"])
    def payment_webhook():
        token = request.headers.get("X-Webhook-Token", "")
        expected = get_setting("webhook_token", app.config["PAYMENT_WEBHOOK_TOKEN"])
        if (
            not token
            or not expected
            or len(token) != len(expected)
            or not secrets.compare_digest(token, expected)
        ):
            return jsonify(ok=False, error="Unauthorized"), 401

        data = request.get_json(silent=True) or {}
        message = data.get("message") or data.get("sms") or request.form.get("message")
        if not message:
            return jsonify(ok=False, error="message is required"), 400

        sender = data.get("sender") or data.get("from")
        amount = data.get("amount")
        try:
            amount = float(amount) if amount is not None else None
        except (TypeError, ValueError):
            amount = None

        result = ingest_payment_message(
            message,
            sender_hint=sender,
            amount_hint=amount,
            provider_hint=data.get("provider"),
            txn_hint=data.get("transaction_ref") or data.get("txn"),
            sender_app=data.get("sender_app") or data.get("address"),
        )
        return jsonify(ok=True, **result)

    @app.route("/api/payment/link")
    def payment_link_info():
        return jsonify(
            webhook_url=url_for("payment_webhook", _external=True),
            header="X-Webhook-Token",
            example={
                "message": "تم استلام 100 EGP من الرقم 01012345678 رقم العملية TXN998877",
                "sender": "01012345678",
                "amount": 100,
                "provider": "vodafone_cash",
            },
        )

    # ---------- Reseller portal ----------

    @app.route("/reseller/login", methods=["GET", "POST"])
    def reseller_login():
        if session.get("reseller_id"):
            return redirect(url_for("reseller_dashboard"))
        error = None
        if request.method == "POST":
            username = (request.form.get("username") or "").strip()
            password = request.form.get("password") or ""
            reseller = Reseller.query.filter_by(username=username, is_active=True).first()
            if reseller and reseller.check_password(password):
                session["reseller_id"] = reseller.id
                session["reseller_username"] = reseller.username
                return redirect(url_for("reseller_dashboard"))
            error = "بيانات الدخول غير صحيحة أو الحساب موقوف"
        return render_template("reseller/login.html", error=error)

    @app.route("/reseller/logout")
    def reseller_logout():
        session.pop("reseller_id", None)
        session.pop("reseller_username", None)
        return redirect(url_for("reseller_login"))

    @app.route("/reseller")
    @reseller_required
    def reseller_dashboard():
        reseller = Reseller.query.get_or_404(session["reseller_id"])
        orders = (
            Order.query.filter_by(reseller_id=reseller.id)
            .order_by(Order.created_at.desc())
            .limit(20)
            .all()
        )
        packages = (
            Package.query.filter_by(is_active=True).order_by(Package.price.asc()).all()
        )
        return render_template(
            "reseller/dashboard.html",
            reseller=reseller,
            orders=orders,
            packages=packages,
            status_labels=STATUS_LABELS,
        )

    @app.route("/reseller/order", methods=["POST"])
    @reseller_required
    def reseller_create_order():
        from services.tasks import enqueue_verification

        reseller = Reseller.query.get_or_404(session["reseller_id"])
        name = (request.form.get("customer_name") or "").strip() or reseller.company_name
        number = request.form.get("vodafone_number") or ""
        whatsapp = request.form.get("whatsapp_number") or number
        national_id = (request.form.get("national_id") or "").strip()
        account_password = (request.form.get("account_password") or "").strip()
        package_id = request.form.get("package_id", type=int)

        ok, message, normalized = validate_vodafone_customer(number)
        package = Package.query.filter_by(id=package_id, is_active=True).first()
        wa_norm = normalize_egypt_mobile(whatsapp) or normalized

        if not ok or not package:
            flash(message if not ok else "اختر باقة صحيحة", "error")
            return redirect(url_for("reseller_dashboard"))

        price = package.price_for(reseller)
        if float(reseller.balance or 0) < price:
            flash("رصيد الموزع غير كافٍ. اطلب شحن رصيد من الإدارة.", "error")
            return redirect(url_for("reseller_dashboard"))

        order = Order(
            reference=make_reference(),
            customer_name=name,
            vodafone_number=normalized,
            whatsapp_number=wa_norm,
            package_id=package.id,
            amount=price,
            pay_to_number="",
            status="verifying",
            reseller_id=reseller.id,
        )
        order.national_id = national_id
        order.account_password = account_password
        db.session.add(order)
        db.session.commit()

        enqueue_verification(order.id)
        db.session.refresh(order)

        if order.status == "awaiting_payment":
            try:
                debit_reseller(
                    reseller, price, reason="wholesale_order", order_id=order.id
                )
                order.status = "paid"
                order.payment_matched_at = utcnow()
                db.session.commit()
                notify_order_update(order, event="reseller_paid")
                flash(f"تم إنشاء الطلب وخصم {price:.0f} ج.م من رصيدك.", "success")
            except ValueError as exc:
                flash(str(exc), "error")
        elif order.status == "verification_failed":
            flash(order.verification_message or "فشل التحقق من الحساب", "error")
        else:
            flash("الطلب قيد التحقق في الخلفية.", "success")

        return redirect(url_for("reseller_dashboard"))

    # ---------- Admin ----------

    @app.route("/admin/login", methods=["GET", "POST"])
    def admin_login():
        if session.get("admin_id"):
            return redirect(url_for("admin_dashboard"))
        error = None
        if request.method == "POST":
            username = (request.form.get("username") or "").strip()
            password = request.form.get("password") or ""
            admin = Admin.query.filter_by(username=username).first()
            if admin and admin.check_password(password):
                session["admin_id"] = admin.id
                session["admin_username"] = admin.username
                session.permanent = True
                return redirect(url_for("admin_dashboard"))
            error = "اسم المستخدم أو كلمة المرور غير صحيحة"
        return render_template("admin/login.html", error=error)

    @app.route("/admin/logout")
    def admin_logout():
        session.clear()
        return redirect(url_for("admin_login"))

    @app.route("/admin")
    @admin_required
    def admin_dashboard():
        stats = {
            "orders": Order.query.count(),
            "awaiting": Order.query.filter(
                Order.status.in_(
                    ["verifying", "awaiting_payment", "payment_submitted"]
                )
            ).count(),
            "paid": Order.query.filter_by(status="paid").count(),
            "fulfilled": Order.query.filter_by(status="fulfilled").count(),
            "packages": Package.query.filter_by(is_active=True).count(),
            "events": PaymentEvent.query.count(),
            "resellers": Reseller.query.filter_by(is_active=True).count(),
            "wallets": CustomerWallet.query.count(),
        }
        recent = Order.query.order_by(Order.created_at.desc()).limit(10).all()
        return render_template(
            "admin/dashboard.html",
            stats=stats,
            recent=recent,
            status_labels=STATUS_LABELS,
        )

    @app.route("/admin/orders")
    @admin_required
    def admin_orders():
        status = request.args.get("status")
        query = Order.query.order_by(Order.created_at.desc())
        if status:
            query = query.filter_by(status=status)
        orders = query.all()
        return render_template(
            "admin/orders.html",
            orders=orders,
            status=status,
            status_labels=STATUS_LABELS,
        )

    @app.route("/admin/orders/export")
    @admin_required
    def admin_orders_export():
        status = request.args.get("status")
        query = Order.query.order_by(Order.created_at.desc())
        if status:
            query = query.filter_by(status=status)
        orders = query.all()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "reference",
                "customer_name",
                "vodafone_number",
                "whatsapp_number",
                "package",
                "amount",
                "sender_number",
                "status",
                "reseller_id",
                "paid_from_wallet",
                "renewal_at",
                "created_at",
            ]
        )
        for o in orders:
            writer.writerow(
                [
                    o.reference,
                    o.customer_name,
                    o.vodafone_number,
                    o.whatsapp_number,
                    o.package.name if o.package else "",
                    o.amount,
                    o.sender_number,
                    o.status,
                    o.reseller_id or "",
                    o.paid_from_wallet,
                    o.renewal_at.isoformat() if o.renewal_at else "",
                    o.created_at.isoformat() if o.created_at else "",
                ]
            )
        return Response(
            "\ufeff" + buf.getvalue(),
            mimetype="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": "attachment; filename=vodafone_orders.csv"
            },
        )

    @app.route("/admin/orders/<int:order_id>", methods=["GET", "POST"])
    @admin_required
    def admin_order_detail(order_id):
        order = Order.query.get_or_404(order_id)
        if request.method == "POST":
            action = request.form.get("action")
            if action == "mark_paid":
                order.status = "paid"
                order.payment_matched_at = utcnow()
            elif action == "mark_fulfilled":
                _fulfill_order(order)
            elif action == "activation_failed":
                from services.tasks import mark_activation_failed

                reason = request.form.get("fail_reason") or ""
                mark_activation_failed.delay(order.id, reason)
                db.session.refresh(order)
            elif action == "reject":
                order.status = "rejected"
            elif action == "notes":
                order.notes = request.form.get("notes") or ""
            db.session.commit()
            if action in {"mark_paid", "mark_fulfilled", "reject", "activation_failed"}:
                notify_order_update(order, event=action)
            flash("تم تحديث الطلب", "success")
            return redirect(url_for("admin_order_detail", order_id=order.id))
        return render_template(
            "admin/order_detail.html", order=order, status_labels=STATUS_LABELS
        )

    @app.route("/admin/packages", methods=["GET", "POST"])
    @admin_required
    def admin_packages():
        if request.method == "POST":
            action = request.form.get("action") or "create"
            try:
                price = float(request.form.get("price") or 0)
                wholesale_raw = request.form.get("wholesale_price")
                wholesale_price = (
                    float(wholesale_raw) if wholesale_raw not in (None, "") else None
                )
                data_gb = float(request.form.get("data_gb") or 0)
                minutes = int(request.form.get("minutes") or 0)
                validity_days = int(request.form.get("validity_days") or 30)
            except ValueError:
                flash("تحقق من الأرقام المدخلة", "error")
                return redirect(url_for("admin_packages"))

            name = (request.form.get("name") or "").strip()
            description = (request.form.get("description") or "").strip()

            if action == "update":
                package = Package.query.get_or_404(
                    request.form.get("package_id", type=int)
                )
                if not name or price <= 0:
                    flash("اسم الباقة والسعر مطلوبان", "error")
                else:
                    package.name = name
                    package.description = description
                    package.price = price
                    package.wholesale_price = wholesale_price
                    package.data_gb = data_gb
                    package.minutes = minutes
                    package.validity_days = validity_days
                    db.session.commit()
                    flash("تم تحديث الباقة", "success")
                return redirect(url_for("admin_packages"))

            if not name or price <= 0:
                flash("اسم الباقة والسعر مطلوبان", "error")
            else:
                db.session.add(
                    Package(
                        name=name,
                        description=description,
                        price=price,
                        wholesale_price=wholesale_price,
                        data_gb=data_gb,
                        minutes=minutes,
                        validity_days=validity_days,
                        is_active=True,
                    )
                )
                db.session.commit()
                flash("تمت إضافة الباقة", "success")
            return redirect(url_for("admin_packages"))

        packages = Package.query.order_by(Package.created_at.desc()).all()
        return render_template("admin/packages.html", packages=packages)

    @app.route("/admin/packages/<int:package_id>/toggle", methods=["POST"])
    @admin_required
    def admin_toggle_package(package_id):
        package = Package.query.get_or_404(package_id)
        package.is_active = not package.is_active
        db.session.commit()
        return redirect(url_for("admin_packages"))

    @app.route("/admin/payments")
    @admin_required
    def admin_payments():
        events = (
            PaymentEvent.query.order_by(PaymentEvent.created_at.desc()).limit(100).all()
        )
        return render_template("admin/payments.html", events=events)

    @app.route("/admin/cash-wallets", methods=["GET", "POST"])
    @admin_required
    def admin_cash_wallets():
        if request.method == "POST":
            action = request.form.get("action") or "create"
            if action == "create":
                number = normalize_egypt_mobile(request.form.get("number") or "")
                if not number:
                    flash("رقم المحفظة غير صحيح", "error")
                elif CashWallet.query.filter_by(number=number).first():
                    flash("المحفظة موجودة مسبقاً", "error")
                else:
                    db.session.add(
                        CashWallet(
                            label=(request.form.get("label") or "").strip()
                            or number,
                            number=number,
                            provider=request.form.get("provider") or "vodafone_cash",
                            daily_limit=float(request.form.get("daily_limit") or 50000),
                            monthly_limit=float(
                                request.form.get("monthly_limit") or 500000
                            ),
                            priority=int(request.form.get("priority") or 100),
                            is_active=True,
                        )
                    )
                    db.session.commit()
                    flash("تمت إضافة المحفظة", "success")
            elif action == "toggle":
                wallet = CashWallet.query.get_or_404(
                    request.form.get("wallet_id", type=int)
                )
                wallet.is_active = not wallet.is_active
                db.session.commit()
            elif action == "update_limits":
                wallet = CashWallet.query.get_or_404(
                    request.form.get("wallet_id", type=int)
                )
                wallet.daily_limit = float(request.form.get("daily_limit") or wallet.daily_limit)
                wallet.monthly_limit = float(
                    request.form.get("monthly_limit") or wallet.monthly_limit
                )
                wallet.priority = int(request.form.get("priority") or wallet.priority)
                wallet.label = (request.form.get("label") or wallet.label).strip()
                db.session.commit()
                flash("تم تحديث حدود المحفظة", "success")
            return redirect(url_for("admin_cash_wallets"))

        wallets = CashWallet.query.order_by(CashWallet.priority.asc()).all()
        return render_template("admin/cash_wallets.html", wallets=wallets)

    @app.route("/admin/resellers", methods=["GET", "POST"])
    @admin_required
    def admin_resellers():
        if request.method == "POST":
            action = request.form.get("action") or "create"
            if action == "create":
                username = (request.form.get("username") or "").strip()
                password = request.form.get("password") or ""
                if not username or len(password) < 6:
                    flash("يوزر وكلمة مرور (6+) مطلوبان", "error")
                elif Reseller.query.filter_by(username=username).first():
                    flash("اسم المستخدم مستخدم", "error")
                else:
                    reseller = Reseller(
                        username=username,
                        company_name=(request.form.get("company_name") or "").strip(),
                        phone=normalize_egypt_mobile(request.form.get("phone") or "")
                        or "",
                        balance=float(request.form.get("balance") or 0),
                        is_active=True,
                    )
                    reseller.set_password(password)
                    db.session.add(reseller)
                    db.session.commit()
                    flash("تم إنشاء حساب الموزع", "success")
            elif action == "topup":
                reseller = Reseller.query.get_or_404(
                    request.form.get("reseller_id", type=int)
                )
                amount = float(request.form.get("amount") or 0)
                try:
                    credit_reseller(reseller, amount, reason="admin_topup")
                    flash("تم شحن رصيد الموزع", "success")
                except ValueError as exc:
                    flash(str(exc), "error")
            elif action == "toggle":
                reseller = Reseller.query.get_or_404(
                    request.form.get("reseller_id", type=int)
                )
                reseller.is_active = not reseller.is_active
                db.session.commit()
            return redirect(url_for("admin_resellers"))

        resellers = Reseller.query.order_by(Reseller.created_at.desc()).all()
        return render_template("admin/resellers.html", resellers=resellers)

    @app.route("/admin/customer-wallets")
    @admin_required
    def admin_customer_wallets():
        wallets = CustomerWallet.query.order_by(CustomerWallet.updated_at.desc()).all()
        return render_template("admin/customer_wallets.html", wallets=wallets)

    @app.route("/admin/settings", methods=["GET", "POST"])
    @admin_required
    def admin_settings():
        if request.method == "POST":
            cash = normalize_egypt_mobile(
                request.form.get("vodafone_cash_number") or ""
            )
            instapay = (request.form.get("instapay_address") or "").strip()
            token = (request.form.get("webhook_token") or "").strip()
            new_password = request.form.get("new_password") or ""

            if cash:
                set_setting("vodafone_cash_number", cash)
                seed_cash_wallet_from_setting(cash)
            set_setting("instapay_address", instapay)
            if token:
                set_setting("webhook_token", token)

            for key in (
                "telegram_bot_token",
                "telegram_chat_id",
                "whatsapp_provider",
                "whatsapp_api_key",
                "whatsapp_instance_id",
                "whatsapp_webhook_url",
            ):
                if key in request.form:
                    set_setting(key, (request.form.get(key) or "").strip())

            if new_password:
                if len(new_password) < 8:
                    flash("كلمة المرور يجب ألا تقل عن 8 أحرف", "error")
                    return redirect(url_for("admin_settings"))
                admin = Admin.query.get(session["admin_id"])
                admin.set_password(new_password)
                db.session.commit()

            flash("تم حفظ الإعدادات", "success")
            return redirect(url_for("admin_settings"))

        return render_template(
            "admin/settings.html",
            cash_number=get_setting("vodafone_cash_number"),
            instapay_address=get_setting("instapay_address"),
            webhook_token=get_setting("webhook_token"),
            webhook_url=url_for("payment_webhook", _external=True),
            telegram_bot_token=get_setting("telegram_bot_token"),
            telegram_chat_id=get_setting("telegram_chat_id"),
            whatsapp_provider=get_setting("whatsapp_provider") or "callmebot",
            whatsapp_api_key=get_setting("whatsapp_api_key"),
            whatsapp_instance_id=get_setting("whatsapp_instance_id"),
            whatsapp_webhook_url=get_setting("whatsapp_webhook_url"),
            verify_mode=app.config.get("VODAFONE_VERIFY_MODE", "mock"),
        )


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
