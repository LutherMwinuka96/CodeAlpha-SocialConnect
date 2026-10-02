# CodeAlpha Connect

CodeAlpha Connect is a Django and Django REST Framework social network with a responsive browser interface, cookie-based JWT authentication, PostgreSQL support, and SQLite as a local development fallback.

## Features

- Account registration, username/email login, logout, rotating refresh tokens, password changes, and password reset emails (printed to the console in development).
- Editable user profiles with avatar and cover uploads, bio, location, website, and saved theme preference.
- Following and Explore feeds, post creation/edit/deletion, image uploads, hashtags, bookmarks, comments, post/comment likes, and profile Posts/Replies/Likes/Media views.
- User/post/hashtag search, suggested users, followers/following lists, and notifications for follows, likes, comments, and mentions.
- Responsive light/dark/system themes, accessible forms and navigation, empty/loading/error states, and mobile navigation.
- Django admin, API throttling, image validation, owner permissions, pagination, and OpenAPI/Swagger documentation.

## Technology

- Python 3.11 or newer; Django 5; Django REST Framework; Simple JWT.
- PostgreSQL for deployments, SQLite when `DATABASE_URL` is empty.
- HTML, custom CSS, and vanilla JavaScript ES modules.
- Pillow, django-cors-headers, django-filter, drf-spectacular, python-decouple, WhiteNoise, Gunicorn, pytest-django, and Docker Compose.

## Prerequisites

For local development, install Python 3.11+, pip, and (optionally) PostgreSQL 14+. For the container setup, install Docker Engine/Desktop with the Compose plugin. Node.js is only needed if you want to run JavaScript syntax checks; there is no frontend build step.

## Local installation

From the project directory, create and activate a virtual environment.

**Windows PowerShell:**

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

**macOS/Linux:**

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` before starting. Set `SECRET_KEY` to a unique, long random value and keep `.env` private. `DEBUG=True` is suitable only for local development. `DATABASE_URL=` selects the SQLite database at `db.sqlite3`; use the PostgreSQL setup below to use PostgreSQL locally.

Run migrations and create an administrator account:

```sh
python manage.py migrate
python manage.py createsuperuser
```

Optionally populate the site with sample content, then start Django:

```sh
python manage.py seed_demo
python manage.py runserver
```

Open <http://127.0.0.1:8000/>. Admin is at `/admin/`; API documentation is at `/api/docs/`. The seed command creates `maya`, `sam`, `amina`, and `leo` only when those accounts do not already exist. Their initial password is `ConnectDemo!2026_River`. Change or remove these demo accounts before exposing the site to other people. Re-running the command is safe and does not reset existing passwords.

## PostgreSQL setup

Create a local role and database (replace the sample password with a private value):

```sql
CREATE ROLE codealpha WITH LOGIN PASSWORD 'choose-a-private-password';
CREATE DATABASE codealpha OWNER codealpha;
```

Set `DATABASE_URL` in `.env`:

```dotenv
DATABASE_URL=postgresql://codealpha:choose-a-private-password@127.0.0.1:5432/codealpha
```

If the password contains reserved URL characters, percent-encode them in the URL. Then run `python manage.py migrate` as above. The settings select PostgreSQL for a `postgres://` or `postgresql://` URL; if the value is blank or not one of those schemes, they use SQLite.

## Environment settings

`.env.example` documents the supported variables. The main settings are:

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | Django signing key; use a unique secret outside local development. |
| `DEBUG` | Enables development behavior; production settings set it to false. |
| `ALLOWED_HOSTS` | Comma-separated hostnames accepted by Django. |
| `DATABASE_URL` | PostgreSQL connection URL; blank selects SQLite. |
| `CSRF_TRUSTED_ORIGINS` | Comma-separated trusted origins when requests come through a different HTTPS origin. |
| `CORS_ALLOWED_ORIGINS` | Explicit browser origins allowed by CORS. |
| `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` | HTTPS and secure-cookie controls. Enable these when serving through HTTPS. |
| `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS` | JWT lifetimes. |
| `EMAIL_BACKEND`, `FRONTEND_URL` | Password-reset delivery and reset-link base URL. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `PORT` | Compose database credentials and published web port. |

The default email backend writes reset email contents to the server console. Configure a real email backend before relying on password reset in production. For production, use `config.settings.prod`, a strong secret, HTTPS, secure cookies, explicit hosts/origins, persistent media storage, and a production email service. Do not commit `.env` or use the sample Compose database password in a public deployment.

## Docker Compose

Copy `.env.example` to `.env`, replace `SECRET_KEY`, and adjust the database password before launching. Compose starts PostgreSQL, waits for its health check, then runs migrations and collects static assets before starting Gunicorn.

```sh
docker compose up --build
```

Open <http://127.0.0.1:8000/>. Stop with `Ctrl+C`; use `docker compose down` to stop the services. Persistent PostgreSQL and uploaded media are held in named volumes. Create an admin user with:

```sh
docker compose exec web python manage.py createsuperuser
```

Seed the database with:

```sh
docker compose exec web python manage.py seed_demo
```

For deployments behind HTTPS, set `SECURE_SSL_REDIRECT=True`, `SESSION_COOKIE_SECURE=True`, `CSRF_COOKIE_SECURE=True`, configure `CSRF_TRUSTED_ORIGINS` and `ALLOWED_HOSTS`, and ensure the proxy forwards the HTTPS scheme correctly. Back up the database and media volume as part of deployment operations.

## Tests and checks

Run the automated Django tests with:

```sh
pytest
```

The tests cover authentication, owner-only post editing/deletion, invalid image rejection, repeated likes/follows, self-follow prevention, and feed membership. You can also run Django's configuration checks with `python manage.py check`. A local environment needs the packages in `requirements.txt` installed first.

## API overview

All API routes are versioned under `/api/v1/`.

| Area | Routes |
| --- | --- |
| Authentication | `/auth/csrf/`, `/auth/register/`, `/auth/login/`, `/auth/logout/`, `/auth/token/refresh/`, `/auth/me/`, `/auth/change-password/`, `/auth/password-reset/`, `/auth/password-reset/confirm/` |
| Current user | `GET/PATCH/DELETE /users/me/` |
| Users | `/users/`, `/users/suggestions/`, `/users/{username}/`, and the `followers`, `following`, `posts`, `replies`, `likes`, `media`, and `follow` actions |
| Posts | `/posts/`, `/posts/feed/`, `/posts/explore/`, `/posts/saved/`, `/posts/by_hashtag/`, `/posts/trending/`, and per-post `like`, `bookmark`, and `comments` actions |
| Search | `/search/?q=...` returns people, posts, and hashtags |
| Notifications | `/notifications/`, `/notifications/unread_count/`, `/notifications/mark_read/`, `/notifications/mark_all_read/` |
| API schema/docs | `/api/schema/` and `/api/docs/` |

Authentication uses HTTP-only access and refresh cookies. The frontend obtains a CSRF token from `/api/v1/auth/csrf/` and sends it for cookie-authenticated writes. List endpoints use limit/offset pagination (default limit 20; maximum 100).

## Project structure

```text
apps/
  accounts/       User/profile models, authentication, user endpoints, admin, tests
  core/           Shared auth, permissions, validation, pagination, utilities, seed command
  notifications/  Notification model, API, admin
  posts/          Posts/hashtags, serializers, endpoints, admin, tests
  social/         Follows, comments, likes, bookmarks, admin, tests
config/           Settings, page/API URLs, ASGI and WSGI entry points
templates/        Shared layout and auth, feed, profile, search, notification, and legal pages
static/css/       Design tokens, components, layout, light/dark styles
static/js/        API client and page, theme, and interaction modules
media/            Uploaded images at runtime (gitignored)
```

## Troubleshooting

- **Database connection refused:** Confirm PostgreSQL is running and the host, port, database, role, and password in `DATABASE_URL` match. With Compose, inspect `docker compose logs db` and `docker compose ps`.
- **Missing table or schema errors:** Run `python manage.py migrate` locally or restart the web container so its entrypoint applies migrations.
- **Static files are missing in production/Compose:** Confirm `collectstatic` completed and requests are served through Django WhiteNoise. The Compose entrypoint runs it at startup.
- **Images do not persist:** Local uploads are stored under `media/`; Compose mounts the `media_data` volume. Configure durable storage and backups for production.
- **CSRF failures:** Fetch `/api/v1/auth/csrf/` before submitting cookie-authenticated writes. For a different HTTPS origin, configure `CSRF_TRUSTED_ORIGINS` and use matching secure-cookie settings.
- **Host rejected:** Add the requested hostname to `ALLOWED_HOSTS`.
- **Password reset email not visible:** The development console email backend prints the reset link in the runserver output.
- **Demo login fails:** The seed password is printed only when accounts are created. Existing demo accounts keep their current passwords when the command is run again.
- **Tests cannot start:** Verify the active virtual environment uses Python 3.11+ and install `requirements.txt`. On Windows, if the `py` launcher is unavailable, invoke the environment directly with `.\.venv\Scripts\python.exe`.
