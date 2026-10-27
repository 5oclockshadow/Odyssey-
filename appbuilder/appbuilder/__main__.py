"""Run the Studio backend: `python -m appbuilder` (default :9906)."""
import os
import uvicorn
from .service import app


def main() -> None:
    uvicorn.run(app, host=os.getenv("STUDIO_HOST", "0.0.0.0"),
                port=int(os.getenv("STUDIO_PORT", "9906")), log_config=None)


if __name__ == "__main__":
    main()
