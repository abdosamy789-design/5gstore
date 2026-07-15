import secrets
import string
from functools import wraps

from flask import (
    Flask,
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
from services.payment_gateway import ingest_payment_message
from services.vodafone_validator import normalize_egypt_mobile, validate_vodafone_customer


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    db.init_app(app)

    with app.app_context():
        db.create_all()
        _seed_defaults(app)

    register_routes(app)
    return app


def _seed_defaults(app: Flask) -> None:
    if not Admin.query.filter_by(username=app.config["ADMIN_USERNAME"]).first():
        admin = Admin(username=app.config["ADMIN_USERNAME"])
        admin.set_password(app.config["ADMIN_PASSWORD"])
        db.session.add(admin)

    if not Setting.query.filter_by(key="vodafone_cash_number").first():
        db.session.add(
            Setting(
                key="vodafone_cash_number",
                value=app.config["VODAFONE_CASH_NUMBER"],
            )
        )

    if not Setting.query.filter_by(key="webhook_token").first():
        db.session.add(
            Setting(
                key="webhook_token",
                value=app.config["PAYMENT_WEBHOOK_TOKEN"],
            )
        )

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
            national_id = (request.form.get("national_id") or "").strip()
            package_id = request.form.get("package_id", type=int)

            ok, message, normalized = validate_vodafone_customer(number)
            package = Package.query.filter_by(id=package_id, is_active=True).first()

            errors = []
            if len(name) < 3:
                errors.append("اكتب الاسم بالكامل (3 حروف على الأقل).")
            if not ok:
                errors.append(message)
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
                vodafone_number=normalized,
                national_id=national_id,
                package_id=package.id,
                amount=package.price,
                pay_to_number=get_setting(
                    "vodafone_cash_number", app.config["VODAFONE_CASH_NUMBER"]
                ),
                status="awaiting_payment",
            )
            db.session.add(order)
            db.session.commit()
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

    @app.route("/pay/<reference>", methods=["GET", "POST"])
    def payment_page(reference):
        order = Order.query.filter_by(reference=reference).first_or_404()

        if request.method == "POST":
            sender = request.form.get("sender_number") or ""
            ok, message, normalized = validate_vodafone_customer(sender)
            # Sender can be any Egyptian Vodafone Cash wallet — still Vodafone 010
            if not ok:
                flash(message, "error")
                return render_template("customer/payment.html", order=order)

            order.sender_number = normalized
            if order.status == "awaiting_payment":
                order.status = "payment_submitted"
            db.session.commit()

            # Try match against already-received SMS events
            pending_events = (
                PaymentEvent.query.filter_by(matched=False)
                .order_by(PaymentEvent.created_at.desc())
                .limit(50)
                .all()
            )
            for event in pending_events:
                if event.sender_number == normalized and (
                    event.amount is None or abs(event.amount - order.amount) < 0.01
                ):
                    order.status = "paid"
                    event.matched = True
                    event.order_id = order.id
                    db.session.commit()
                    break

            flash("تم تسجيل رقم التحويل. جاري التحقق من الدفع.", "success")
            return redirect(url_for("order_status", reference=order.reference))

        return render_template("customer/payment.html", order=order)

    @app.route("/status/<reference>")
    def order_status(reference):
        order = Order.query.filter_by(reference=reference).first_or_404()
        return render_template("customer/status.html", order=order)

    # ---------- Payment gateway for mobile app ----------

    @app.route("/api/payment/webhook", methods=["POST"])
    def payment_webhook():
        """
        Endpoint for the mobile app.
        Add this URL in the mobile app that forwards Vodafone Cash SMS.

        Headers:
          X-Webhook-Token: <token>
        JSON body:
          { "message": "...full SMS...", "sender": "010...", "amount": 100 }
        """
        token = request.headers.get("X-Webhook-Token", "")
        expected = get_setting("webhook_token", app.config["PAYMENT_WEBHOOK_TOKEN"])
        if not token or token != expected:
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

        result = ingest_payment_message(message, sender_hint=sender, amount_hint=amount)
        return jsonify(ok=True, **result)

    @app.route("/api/payment/link")
    def payment_link_info():
        """Public info page helper: shows the webhook URL the mobile app should use."""
        return jsonify(
            webhook_url=url_for("payment_webhook", _external=True),
            header="X-Webhook-Token",
            example={
                "message": "تم استلام 100 EGP من الرقم 01012345678",
                "sender": "01012345678",
                "amount": 100,
            },
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
        }
        recent = Order.query.order_by(Order.created_at.desc()).limit(10).all()
        return render_template("admin/dashboard.html", stats=stats, recent=recent)

    @app.route("/admin/orders")
    @admin_required
    def admin_orders():
        status = request.args.get("status")
        query = Order.query.order_by(Order.created_at.desc())
        if status:
            query = query.filter_by(status=status)
        orders = query.all()
        return render_template("admin/orders.html", orders=orders, status=status)

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
            flash("تم تحديث الطلب", "success")
            return redirect(url_for("admin_order_detail", order_id=order.id))
        return render_template("admin/order_detail.html", order=order)

    @app.route("/admin/packages", methods=["GET", "POST"])
    @admin_required
    def admin_packages():
        if request.method == "POST":
            name = (request.form.get("name") or "").strip()
            description = (request.form.get("description") or "").strip()
            try:
                price = float(request.form.get("price") or 0)
                data_gb = float(request.form.get("data_gb") or 0)
                minutes = int(request.form.get("minutes") or 0)
                validity_days = int(request.form.get("validity_days") or 30)
            except ValueError:
                flash("تحقق من الأرقام المدخلة", "error")
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
        events = PaymentEvent.query.order_by(PaymentEvent.created_at.desc()).limit(100).all()
        return render_template("admin/payments.html", events=events)

    @app.route("/admin/settings", methods=["GET", "POST"])
    @admin_required
    def admin_settings():
        if request.method == "POST":
            cash = normalize_egypt_mobile(request.form.get("vodafone_cash_number") or "")
            token = (request.form.get("webhook_token") or "").strip()
            new_password = request.form.get("new_password") or ""

            if cash:
                set_setting("vodafone_cash_number", cash)
            if token:
                set_setting("webhook_token", token)
            if new_password and len(new_password) >= 6:
                admin = Admin.query.get(session["admin_id"])
                admin.set_password(new_password)
                db.session.commit()

            flash("تم حفظ الإعدادات", "success")
            return redirect(url_for("admin_settings"))

        return render_template(
            "admin/settings.html",
            cash_number=get_setting("vodafone_cash_number"),
            webhook_token=get_setting("webhook_token"),
            webhook_url=url_for("payment_webhook", _external=True),
        )


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
