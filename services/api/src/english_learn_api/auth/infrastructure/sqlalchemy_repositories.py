"""PostgreSQL adapters for the user and refresh-token repositories (SQLAlchemy Core, asyncpg)."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import RowMapping, Select, delete, literal_column, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from english_learn_api.auth.domain.models import GoogleIdentity, RefreshFamily, RefreshToken, User
from english_learn_api.auth.infrastructure.tables import refresh_families, refresh_tokens, users


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

    async def lock_against_deletion(self, user_id: UUID) -> bool:
        # FOR KEY SHARE conflicts with the FOR UPDATE lock a DELETE takes, and with nothing else.
        statement = select(users.c.id).where(users.c.id == user_id).with_for_update(key_share=True)
        return (await self._session.execute(statement)).first() is not None

    async def delete(self, user_id: UUID) -> bool:
        result = await self._session.execute(
            delete(users).where(users.c.id == user_id).returning(users.c.id)
        )
        return result.first() is not None


class SqlAlchemyRefreshFamilyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, family: RefreshFamily) -> None:
        await self._session.execute(
            refresh_families.insert().values(
                id=family.id,
                user_id=family.user_id,
                created_at=family.created_at,
                revoked_at=family.revoked_at,
            )
        )

    async def get_for_update(self, family_id: UUID) -> RefreshFamily | None:
        statement = (
            select(refresh_families).where(refresh_families.c.id == family_id).with_for_update()
        )
        row = (await self._session.execute(statement)).mappings().one_or_none()
        return None if row is None else RefreshFamily(**row)

    async def revoke(self, family_id: UUID, now: datetime) -> None:
        await self._session.execute(
            update(refresh_families)
            .where(refresh_families.c.id == family_id, refresh_families.c.revoked_at.is_(None))
            .values(revoked_at=now)
        )


class SqlAlchemyRefreshTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, token: RefreshToken) -> None:
        await self._session.execute(refresh_tokens.insert().values(**_columns(token)))

    async def find_by_hash(self, token_hash: str) -> RefreshToken | None:
        statement = select(refresh_tokens).where(refresh_tokens.c.token_hash == token_hash)
        return await self._one_or_none(statement)

    async def get_by_hash_for_update(self, token_hash: str) -> RefreshToken | None:
        statement = (
            select(refresh_tokens)
            .where(refresh_tokens.c.token_hash == token_hash)
            .with_for_update()
        )
        return await self._one_or_none(statement)

    async def get(self, token_id: UUID) -> RefreshToken | None:
        return await self._one_or_none(
            select(refresh_tokens).where(refresh_tokens.c.id == token_id)
        )

    async def _one_or_none(self, statement: Select[Any]) -> RefreshToken | None:
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
