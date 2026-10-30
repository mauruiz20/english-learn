"""PostgreSQL adapters for the user and refresh-token repositories (SQLAlchemy Core, asyncpg)."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import RowMapping, delete, literal_column, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from english_learn_api.auth.domain.models import GoogleIdentity, RefreshToken, User
from english_learn_api.auth.infrastructure.tables import refresh_tokens, users


class SqlAlchemyUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_by_google_sub(
        self, identity: GoogleIdentity, new_id: UUID, now: datetime
    ) -> tuple[User, bool]:
        values = insert(users).values(
            id=new_id, google_sub=identity.sub, email=identity.email, created_at=now
        )
        statement = values.on_conflict_do_update(
            index_elements=[users.c.google_sub], set_={"email": values.excluded.email}
        ).returning(
            *users.c,
            # PostgreSQL idiom: a freshly inserted row has no deleting transaction id yet.
            literal_column("xmax = 0").label("inserted"),
        )
        row = (await self._session.execute(statement)).mappings().one()
        return _user(row), bool(row["inserted"])

    async def get(self, user_id: UUID) -> User | None:
        row = (
            (await self._session.execute(select(users).where(users.c.id == user_id)))
            .mappings()
            .one_or_none()
        )
        return None if row is None else _user(row)

    async def delete(self, user_id: UUID) -> bool:
        result = await self._session.execute(
            delete(users).where(users.c.id == user_id).returning(users.c.id)
        )
        return result.first() is not None


class SqlAlchemyRefreshTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, token: RefreshToken) -> None:
        await self._session.execute(refresh_tokens.insert().values(**_columns(token)))

    async def get_by_hash_for_update(self, token_hash: str) -> RefreshToken | None:
        statement = (
            select(refresh_tokens)
            .where(refresh_tokens.c.token_hash == token_hash)
            .with_for_update()
        )
        row = (await self._session.execute(statement)).mappings().one_or_none()
        return None if row is None else RefreshToken(**row)

    async def save(self, token: RefreshToken) -> None:
        await self._session.execute(
            update(refresh_tokens)
            .where(refresh_tokens.c.id == token.id)
            .values(revoked_at=token.revoked_at, replaced_by=token.replaced_by)
        )

    async def revoke_family(self, family_id: UUID, now: datetime) -> None:
        await self._session.execute(
            update(refresh_tokens)
            .where(refresh_tokens.c.family_id == family_id, refresh_tokens.c.revoked_at.is_(None))
            .values(revoked_at=now)
        )


def _user(row: RowMapping) -> User:
    return User(
        id=row["id"], google_sub=row["google_sub"], email=row["email"], created_at=row["created_at"]
    )


def _columns(token: RefreshToken) -> dict[str, Any]:
    return {
        "id": token.id,
        "user_id": token.user_id,
        "family_id": token.family_id,
        "token_hash": token.token_hash,
        "created_at": token.created_at,
        "expires_at": token.expires_at,
        "revoked_at": token.revoked_at,
        "replaced_by": token.replaced_by,
    }
