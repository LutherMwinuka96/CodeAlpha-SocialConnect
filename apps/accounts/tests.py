from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase


User = get_user_model()


class AuthenticationApiTests(APITestCase):
    def test_registration_creates_user_profile_and_http_only_cookies(self):
        response = self.client.post("/api/v1/auth/register/", {
            "username": "njeri", "email": "njeri@example.com", "full_name": "Njeri Mwangi",
            "password": "Mango!River!91Blue", "password_confirm": "Mango!River!91Blue",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="njeri")
        self.assertTrue(user.check_password("Mango!River!91Blue"))
        self.assertTrue(user.profile)
        self.assertTrue(response.cookies["access_token"]["httponly"])
        self.assertTrue(response.cookies["refresh_token"]["httponly"])

    def test_login_accepts_email_and_returns_cookie_tokens(self):
        user = User.objects.create_user(username="imani", email="imani@example.com", password="Mango!River!91Blue")
        response = self.client.post("/api/v1/auth/login/", {"username": user.email, "password": "Mango!River!91Blue"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access_token", response.cookies)
        self.assertEqual(response.data["username"], "imani")

    def test_wrong_login_is_rejected(self):
        User.objects.create_user(username="imani", email="imani@example.com", password="Mango!River!91Blue")
        response = self.client.post("/api/v1/auth/login/", {"username": "imani", "password": "wrong-password"}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_private_me_endpoint_requires_authentication(self):
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)

