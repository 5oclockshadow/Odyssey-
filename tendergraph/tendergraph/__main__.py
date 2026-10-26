"""Run TenderGraph: `python -m tendergraph` (own port, default 9905)."""
import os

import uvicorn

from .service import app


def main() -> None:
    uvicorn.run(app, host=os.getenv("TENDER_HOST", "0.0.0.0"),
                port=int(os.getenv("TENDER_PORT", "9905")), log_config=None)


if __name__ == "__main__":
    main()
