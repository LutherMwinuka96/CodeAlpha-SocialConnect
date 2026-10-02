from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.posts.models import Post


User = get_user_model()


class PostApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", email="owner@example.com", password="Mango!River!91Blue")
        self.other = User.objects.create_user(username="other", email="other@example.com", password="Mango!River!91Blue")
        self.post = Post.objects.create(author=self.owner, text="A post worth sharing")
        self.client = APIClient()

    def test_only_owner_can_edit_post(self):
        self.client.force_authenticate(self.other)
        response = self.client.patch(f"/api/v1/posts/{self.post.pk}/", {"text": "Changed by someone else"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.post.refresh_from_db()
        self.assertEqual(self.post.text, "A post worth sharing")

    def test_owner_can_edit_post_and_edited_flag_is_set(self):
        self.client.force_authenticate(self.owner)
        response = self.client.patch(f"/api/v1/posts/{self.post.pk}/", {"text": "An updated post"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.post.refresh_from_db()
        self.assertTrue(self.post.edited)
        self.assertEqual(self.post.text, "An updated post")

    def test_only_owner_can_delete_post(self):
        self.client.force_authenticate(self.other)
        response = self.client.delete(f"/api/v1/posts/{self.post.pk}/")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Post.objects.filter(pk=self.post.pk).exists())

    def test_invalid_image_bytes_are_rejected(self):
        self.client.force_authenticate(self.owner)
        upload = SimpleUploadedFile("photo.png", b"this is not a png", content_type="image/png")
        response = self.client.post("/api/v1/posts/", {"text": "Invalid image", "image": upload}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Post.objects.filter(text="Invalid image").exists())
