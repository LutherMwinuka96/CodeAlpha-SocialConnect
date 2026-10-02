from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsOwnerOrReadOnly(BasePermission):
    """Allow writes only to the object's author/owner."""

    owner_fields = ("author", "user", "follower")

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return any(getattr(obj, field, None) == request.user for field in self.owner_fields)
