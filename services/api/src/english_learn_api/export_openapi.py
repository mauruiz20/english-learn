"""Write the OpenAPI schema to a file (or stdout), without a database or secrets.

    uv run python -m english_learn_api.export_openapi openapi.json

Production does not serve /openapi.json; this is how the client generator gets the schema.
"""

import json
import secrets
import sys
from pathlib import Path
from typing import Any

from pydantic import SecretStr

from english_learn_api.main import create_app
from english_learn_api.settings import Settings


def openapi_schema() -> dict[str, Any]:
    # Placeholder values: building the app connects to nothing, and the schema ignores them.
    settings = Settings(
        _env_file=None,
        env="development",
        database_url="postgresql+asyncpg://export:export@127.0.0.1:1/export",
        jwt_secret=SecretStr(secrets.token_urlsafe(48)),
    )
    return create_app(settings).openapi()


def main(argv: list[str] | None = None) -> None:
    args = sys.argv[1:] if argv is None else argv
    text = json.dumps(openapi_schema(), indent=2, sort_keys=True) + "\n"
    if args:
        Path(args[0]).write_text(text)
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main()
