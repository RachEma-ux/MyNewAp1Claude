"""
KGRA Configuration — loads from config.yaml and environment variables.
All secrets come from env vars or Vault; never from config files.
"""

import os
import yaml
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path

CONFIG_PATH = Path(__file__).parent.parent / "config.yaml"


@dataclass
class GraphStoreConfig:
    uri: str = "bolt://localhost:7687"
    user: str = "neo4j"
    database: str = "neo4j"
    read_only: bool = True
    max_connection_pool: int = 50

    @property
    def password(self) -> str:
        return os.environ.get("KGRA_NEO4J_PASSWORD", "")


@dataclass
class PostgresConfig:
    host: str = "localhost"
    port: int = 5432
    database: str = "kgra"
    user: str = "kgra"
    pool_min: int = 5
    pool_max: int = 20

    @property
    def password(self) -> str:
        return os.environ.get("KGRA_POSTGRES_PASSWORD", "")

    @property
    def dsn(self) -> str:
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"


@dataclass
class RedisConfig:
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    session_ttl_seconds: int = 3600

    @property
    def password(self) -> str:
        return os.environ.get("KGRA_REDIS_PASSWORD", "")


@dataclass
class VectorStoreConfig:
    provider: str = "pgvector"  # "pgvector" | "pinecone"
    dimension: int = 1536
    index_name: str = "kgra_embeddings"

    @property
    def api_key(self) -> str:
        return os.environ.get("KGRA_VECTOR_API_KEY", "")


@dataclass
class LLMConfig:
    provider: str = "openai"  # "openai" | "anthropic" | "local"
    model: str = "gpt-4o"
    embedding_model: str = "text-embedding-3-small"
    max_input_tokens: int = 8000
    max_output_tokens: int = 1000
    temperature: float = 0.1

    @property
    def api_key(self) -> str:
        return os.environ.get("KGRA_LLM_API_KEY", os.environ.get("OPENAI_API_KEY", ""))


@dataclass
class LimitsConfig:
    max_rows: int = 1000
    max_hops: int = 5
    max_graphrag_depth: int = 3
    timeout_per_tool_seconds: int = 5
    llm_input_budget: int = 4000
    llm_output_budget: int = 1000
    graph_read_timeout_seconds: int = 10
    max_vector_queries: int = 5
    max_mcp_calls_per_run: int = 10
    max_bundle_documents: int = 100
    max_bundle_size_mb: int = 10
    max_concurrent_runs: int = 10
    ontology_proposals_per_day: int = 100
    reasoning_path_min_steps: int = 3
    self_learning_batch_seconds: int = 30


@dataclass
class GovernanceConfig:
    read_only_default: bool = True
    require_human_approval_ontology: bool = False
    require_human_approval_cross_workspace: bool = True
    pii_redaction_enabled: bool = True
    audit_retention_days_hot: int = 90
    audit_retention_days_cold: int = 365
    workspace_allowlists: dict = field(default_factory=dict)


@dataclass
class MCPServerEntry:
    name: str = ""
    url: str = ""
    api_key_env: str = ""
    capabilities: list = field(default_factory=list)


@dataclass
class MCPConfig:
    registry: list = field(default_factory=list)
    server_port: int = 8001
    server_api_key_env: str = "KGRA_MCP_SERVER_KEY"


@dataclass
class KGRAConfig:
    source_graph: GraphStoreConfig = field(default_factory=GraphStoreConfig)
    learning_graph: GraphStoreConfig = field(default_factory=lambda: GraphStoreConfig(database="kgra_learning", read_only=False))
    postgres: PostgresConfig = field(default_factory=PostgresConfig)
    redis: RedisConfig = field(default_factory=RedisConfig)
    vector_store: VectorStoreConfig = field(default_factory=VectorStoreConfig)
    llm: LLMConfig = field(default_factory=LLMConfig)
    limits: LimitsConfig = field(default_factory=LimitsConfig)
    governance: GovernanceConfig = field(default_factory=GovernanceConfig)
    mcp: MCPConfig = field(default_factory=MCPConfig)
    api_port: int = 8000
    log_level: str = "INFO"


def load_config(path: Optional[Path] = None) -> KGRAConfig:
    """Load configuration from YAML file, with env var overrides for secrets."""
    config_path = path or CONFIG_PATH
    if config_path.exists():
        with open(config_path) as f:
            raw = yaml.safe_load(f) or {}
    else:
        raw = {}

    cfg = KGRAConfig()

    # Source graph
    sg = raw.get("source_graph", {})
    cfg.source_graph = GraphStoreConfig(**{k: v for k, v in sg.items() if k != "password"})

    # Learning graph
    lg = raw.get("learning_graph", {})
    cfg.learning_graph = GraphStoreConfig(**{k: v for k, v in lg.items() if k != "password"})
    cfg.learning_graph.read_only = False

    # Postgres
    pg = raw.get("postgres", {})
    cfg.postgres = PostgresConfig(**{k: v for k, v in pg.items() if k != "password"})

    # Redis
    rd = raw.get("redis", {})
    cfg.redis = RedisConfig(**{k: v for k, v in rd.items() if k != "password"})

    # Vector
    vs = raw.get("vector_store", {})
    cfg.vector_store = VectorStoreConfig(**{k: v for k, v in vs.items() if k != "api_key"})

    # LLM
    llm = raw.get("llm", {})
    cfg.llm = LLMConfig(**{k: v for k, v in llm.items() if k != "api_key"})

    # Limits
    lim = raw.get("limits", {})
    cfg.limits = LimitsConfig(**lim)

    # Governance
    gov = raw.get("governance", {})
    cfg.governance = GovernanceConfig(**gov)

    # MCP
    mcp_raw = raw.get("mcp", {})
    cfg.mcp = MCPConfig(
        registry=[MCPServerEntry(**s) for s in mcp_raw.get("registry", [])],
        server_port=mcp_raw.get("server_port", 8001),
        server_api_key_env=mcp_raw.get("server_api_key_env", "KGRA_MCP_SERVER_KEY"),
    )

    cfg.api_port = raw.get("api_port", 8000)
    cfg.log_level = raw.get("log_level", "INFO")

    return cfg


# Singleton
_config: Optional[KGRAConfig] = None


def get_config() -> KGRAConfig:
    global _config
    if _config is None:
        _config = load_config()
    return _config
