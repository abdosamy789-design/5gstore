import csv
import io
import secrets
import string
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

from config import Config
from models import Admin, Order, Package, PaymentEvent, Setting, db
from services.notifications import (
    init_notification_defaults,
    notify_order_update,
)
from services.payment_gateway import ingest_payment_message
from services.vodafone_validator import (
    normalize_egypt_mobile,
    validate_vodafone_customer,
    verify_vodafone_account,
)

STATUS_LABELS = {
    "awaiting_payment": "انتظار الدفع",
    "payment_submitted": "تحويل مُسجَّل",
    "paid": "مدفوع",
    "fulfilled": "مُفعَّل",
    "rejected": "مرفوض",
}


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    db.init_app(app)

    with app.app_context():
        db.create_all()
        _migrate_sqlite_columns()
        _seed_defaults(app)
        init_notification_defaults(app)

    register_routes(app)
    return app


def _migrate_sqlite_columns() -> None:
    """Add new columns on existing SQLite DBs without Alembic."""
    uri = str(db.engine.url)
    if not uri.startswith("sqlite"):
        return
    specs = {
        "orders": {
            "whatsapp_number": "VARCHAR(20) DEFAULT ''",
            "account_password": "TEXT DEFAULT ''",
            "account_verified": "BOOLEAN DEFAULT 0",
            "verification_mode": "VARCHAR(20) DEFAULT ''",
            "verification_message": "TEXT DEFAULT ''",
            "instapay_address": "VARCHAR(120) DEFAULT ''",
        },
        "payment_events": {
            "provider": "VARCHAR(40) DEFAULT 'unknown'",
            "transaction_ref": "VARCHAR(80) DEFAULT ''",
        },
    }
    with db.engine.begin() as conn:
        for table, columns in specs.items():
            existing = {
                row[1]
                for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
            }
            for col, typedef in columns.items():
                if col not in existing:
                    conn.exec_driver_sql(
                        f"ALTER TABLE {table} ADD COLUMN {col} {typedef}"
                    )


def _seed_defaults(app: Flask) -> None:
    if not Admin.query.filter_by(username=app.config["ADMIN_USERNAME"]).first():
        admin = Admin(username=app.config["ADMIN_USERNAME"])
        admin.set_password(app.config["ADMIN_PASSWORD"])
        db.session.add(admin)

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
                data_gb=7,
                minutes=1000,
                validity_days=30,
            ),
            Package(
                name="فودافون ريد 100",
                description="باقة فودافون ريد متوسطة",
                price=100,
                data_gb=12,
                minutes=2000,
                validity_days=30,
            ),
            Package(
                name="فودافون ريد 150",
                description="باقة فودافون ريد كبيرة",
                price=150,
                data_gb=25,
                minutes=4000,
                validity_days=30,
            ),
        ]
        db.session.add_all(defaults)

    db.session.commit()


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


def register_routes(app: Flask) -> None:
    # ---------- Customer storefront ----------

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
            name = (request.form.get("customer_name") or "").strip()
            number = request.form.get("vodafone_number") or ""
            whatsapp = request.form.get("whatsapp_number") or number
            national_id = (request.form.get("national_id") or "").strip()
            account_password = (request.form.get("account_password") or "").strip()
            package_id = request.form.get("package_id", type=int)

            verification = verify_vodafone_account(
                number, password=account_password, national_id=national_id
            )
            package = Package.query.filter_by(id=package_id, is_active=True).first()
            # WhatsApp accepts any Egyptian mobile
            wa_norm = normalize_egypt_mobile(whatsapp)

            errors = []
            if len(name) < 3:
                errors.append("اكتب الاسم بالكامل (3 حروف على الأقل).")
            if not verification["ok"]:
                errors.append(verification["message"])
            if not wa_norm:
                errors.append("رقم واتساب غير صحيح.")
            if not package:
                errors.append("اختر باقة صحيحة من القائمة.")

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
                vodafone_number=verification["normalized"],
                whatsapp_number=wa_norm,
                package_id=package.id,
                amount=package.price,
                pay_to_number=get_setting(
                    "vodafone_cash_number", app.config["VODAFONE_CASH_NUMBER"]
                ),
                instapay_address=get_setting(
                    "instapay_address", app.config.get("INSTAPAY_ADDRESS") or ""
                ),
                status="awaiting_payment",
                account_verified=True,
                verification_mode=verification.get("mode") or "",
                verification_message=verification.get("message") or "",
            )
            order.national_id = national_id
            order.account_password = account_password
            db.session.add(order)
            db.session.commit()

            notify_order_update(order, event="order_created")
            return redirect(url_for("payment_page", reference=order.reference))

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

    @app.route("/api/verify-account", methods=["POST"])
    def verify_account_api():
        data = request.get_json(silent=True) or {}
        result = verify_vodafone_account(
            data.get("number", ""),
            password=data.get("password") or "",
            national_id=data.get("national_id") or "",
        )
        return jsonify(result)

    @app.route("/pay/<reference>", methods=["GET", "POST"])
    def payment_page(reference):
        order = Order.query.filter_by(reference=reference).first_or_404()

        if request.method == "POST":
            sender = request.form.get("sender_number") or ""
            normalized = normalize_egypt_mobile(sender)
            if not normalized:
                flash("رقم المحفظة/المحول غير صحيح.", "error")
                return render_template("customer/payment.html", order=order)

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
                    event.matched = True
                    event.order_id = order.id
                    db.session.commit()
                    matched = True
                    notify_order_update(order, event="payment_matched")
                    break

            if not matched:
                notify_order_update(order, event="payment_submitted")

            flash("تم تسجيل رقم التحويل. جاري التحقق من الدفع تلقائياً.", "success")
            return redirect(url_for("order_status", reference=order.reference))

        return render_template("customer/payment.html", order=order)

    @app.route("/status/<reference>")
    def order_status(reference):
        order = Order.query.filter_by(reference=reference).first_or_404()
        return render_template(
            "customer/status.html", order=order, status_labels=STATUS_LABELS
        )

    # ---------- Payment gateway for Android SMS app ----------

    @app.route("/api/payment/webhook", methods=["POST"])
    def payment_webhook():
        """
        Android app endpoint: forward cash/InstaPay SMS here.

        Headers:
          X-Webhook-Token: <token>
        JSON:
          {
            "message": "...SMS body...",
            "sender": "010...",
            "amount": 100,
            "provider": "vodafone_cash|instapay|orange_cash|etisalat_cash",
            "transaction_ref": "ABC123",
            "sender_app": "Vodafone Cash"
          }
        """
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
                "transaction_ref": "TXN998877",
            },
            providers=[
                "vodafone_cash",
                "instapay",
                "orange_cash",
                "etisalat_cash",
                "we_pay",
            ],
        )

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
                Order.status.in_(["awaiting_payment", "payment_submitted"])
            ).count(),
            "paid": Order.query.filter_by(status="paid").count(),
            "fulfilled": Order.query.filter_by(status="fulfilled").count(),
            "packages": Package.query.filter_by(is_active=True).count(),
            "events": PaymentEvent.query.count(),
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
                "account_verified",
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
                    o.account_verified,
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
            elif action == "mark_fulfilled":
                order.status = "fulfilled"
            elif action == "reject":
                order.status = "rejected"
            elif action == "notes":
                order.notes = request.form.get("notes") or ""
            db.session.commit()
            if action in {"mark_paid", "mark_fulfilled", "reject"}:
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
                    package.data_gb = data_gb
                    package.minutes = minutes
                    package.validity_days = validity_days
                    db.session.commit()
                    flash("تم تحديث الباقة والسعر", "success")
                return redirect(url_for("admin_packages"))

            if not name or price <= 0:
                flash("اسم الباقة والسعر مطلوبان", "error")
            else:
                db.session.add(
                    Package(
                        name=name,
                        description=description,
                        price=price,
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
