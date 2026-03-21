from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.gateway import router

app = FastAPI(title="Clara API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory state store — attached directly to the app instance so gateway
# can access it via request.app.presentations
app.presentations: dict = {}  # type: ignore[attr-defined]

app.include_router(router)
