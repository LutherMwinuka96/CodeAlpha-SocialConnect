from rest_framework.routers import DefaultRouter

from .views import PostViewSet, SearchViewSet

router = DefaultRouter()
router.register("posts", PostViewSet, basename="post")
router.register("search", SearchViewSet, basename="search")
urlpatterns = router.urls
