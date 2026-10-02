from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.html import format_html

from .models import Profile, User


class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    extra = 0
    readonly_fields = ("created_at", "updated_at")


@admin.action(description="Deactivate selected users")
def deactivate_users(modeladmin, request, queryset):
    queryset.update(is_active=False)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "email", "full_name", "is_active", "is_staff", "date_joined")
    list_filter = ("is_active", "is_staff", "date_joined")
    search_fields = ("username", "email", "full_name")
    ordering = ("-date_joined",)
    readonly_fields = ("last_login", "date_joined")
    inlines = (ProfileInline,)
    actions = (deactivate_users,)
    fieldsets = DjangoUserAdmin.fieldsets + (("Connect profile", {"fields": ("full_name", "theme")}),)
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (("Connect profile", {"fields": ("email", "full_name")}),)


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "avatar_thumbnail", "location", "created_at", "updated_at")
    search_fields = ("user__username", "user__email", "bio", "location")
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Avatar")
    def avatar_thumbnail(self, obj):
        return format_html('<img src="{}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:50%">', obj.avatar.url) if obj.avatar else "—"
