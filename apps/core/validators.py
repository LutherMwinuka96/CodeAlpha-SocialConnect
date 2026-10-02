"""Validation and safe naming for user supplied images."""
import uuid

from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError


ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024


def validate_image_file(upload):
    if upload.size > MAX_IMAGE_SIZE:
        raise ValidationError("Images must be 5 MB or smaller.")
    try:
        upload.seek(0)
        image = Image.open(upload)
        image.verify()
        if image.format not in ALLOWED_IMAGE_FORMATS:
            raise ValidationError("Upload a JPEG, PNG, or WebP image.")
        upload.seek(0)
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise ValidationError("The uploaded file is not a valid image.")


def safe_image_path(instance, filename):
    upload = getattr(instance, "_current_file_upload", None)
    if upload is None:
        upload = getattr(instance, "avatar", None) or getattr(instance, "cover", None) or getattr(instance, "image", None)
    extension = "jpg"
    try:
        upload.open("rb")
        image_format = Image.open(upload).format
        extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}.get(image_format, "jpg")
        upload.seek(0)
    except (AttributeError, OSError, UnidentifiedImageError):
        pass
    return f"uploads/{uuid.uuid4().hex}.{extension}"
