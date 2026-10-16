import math
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PriceMode = Literal["quick", "balanced", "maximize"]
ListingStatus = Literal["ready", "vinted_draft", "published"]


def positive_price(value: float) -> float:
    if not math.isfinite(value) or value <= 0 or round(value * 100) < 1:
        raise ValueError("Il prezzo deve essere finito e di almeno 0,01 euro.")
    if value > 1_000_000:
        raise ValueError("Il prezzo deve essere al massimo 1000000 euro.")
    return round(value, 2)


class ListingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    note: str = Field(min_length=1, max_length=10000)
    item_type: str | None = Field(default=None, max_length=100)
    brand: str | None = Field(default=None, max_length=100)
    size: str | None = Field(default=None, max_length=100)
    condition: str = Field(default="Buone condizioni", min_length=1, max_length=100)
    price_mode: PriceMode = "balanced"
    explicit_price: float | None = None

    @field_validator("item_type", "brand", "size")
    @classmethod
    def empty_metadata_is_absent(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("explicit_price")
    @classmethod
    def validate_price(cls, value: float | None) -> float | None:
        return None if value is None else positive_price(value)


class ListingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    photo_urls: list[str]
    item_type: str | None
    brand: str | None
    size: str | None
    title: str
    description: str
    category: str
    condition: str
    price: float
    parcel_size: str
    status: ListingStatus
    created_at: datetime
    updated_at: datetime


class ListingPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    item_type: str | None = Field(default=None, max_length=100)
    brand: str | None = Field(default=None, max_length=100)
    size: str | None = Field(default=None, max_length=100)
    title: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=10000)
    category: str | None = Field(default=None, max_length=500)
    condition: str | None = Field(default=None, max_length=100)
    price: float | None = None
    parcel_size: str | None = Field(default=None, max_length=100)
    status: ListingStatus | None = None

    @model_validator(mode="before")
    @classmethod
    def required_fields_cannot_be_cleared(cls, data: object) -> object:
        if isinstance(data, dict):
            required = {"title", "description", "category", "condition", "price", "parcel_size", "status"}
            if any(key in data and data[key] is None for key in required):
                raise ValueError("I campi obbligatori non possono essere null.")
        return data

    @field_validator("title", "description", "category", "item_type", "brand",
                     "size", "condition", "parcel_size")
    @classmethod
    def text_fields_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Il campo non puÃ² essere vuoto.")
        return value

    @field_validator("price")
    @classmethod
    def price_must_be_positive(cls, value: float | None) -> float | None:
        return None if value is None else positive_price(value)
