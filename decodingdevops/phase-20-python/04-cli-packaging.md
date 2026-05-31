# Bài 4: CLI tool + packaging + testing — Python production-grade

Bài cuối phase 20. Build **CLI tool DevOps đúng cách**: argparse/click, project structure, testing, packaging, distribute.

## Project structure

```text
my-tool/
├── pyproject.toml          ← Modern package config
├── README.md
├── LICENSE
├── .gitignore
├── .python-version          ← Pin Python version
├── src/
│   └── my_tool/
│       ├── __init__.py
│       ├── __main__.py
│       ├── cli.py           ← Entry point
│       ├── commands/
│       │   ├── __init__.py
│       │   ├── deploy.py
│       │   └── rollback.py
│       ├── aws/
│       │   ├── __init__.py
│       │   ├── ec2.py
│       │   └── s3.py
│       └── utils.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_cli.py
│   ├── test_aws.py
│   └── fixtures/
└── docs/
```

`src/` layout (vs flat layout) — avoid import bug.

## pyproject.toml — modern config

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "my-tool"
version = "0.1.0"
description = "DevOps automation CLI"
readme = "README.md"
authors = [
    {name = "DevOps Team", email = "devops@acme.com"}
]
license = {text = "MIT"}
requires-python = ">=3.11"
classifiers = [
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
]
dependencies = [
    "boto3 >= 1.34.0",
    "click >= 8.1.0",
    "requests >= 2.31.0",
    "pyyaml >= 6.0",
    "rich >= 13.7.0",
]

[project.optional-dependencies]
dev = [
    "pytest >= 7.4.0",
    "pytest-cov >= 4.1.0",
    "pytest-mock >= 3.12.0",
    "ruff >= 0.1.0",
    "mypy >= 1.7.0",
    "pre-commit >= 3.6.0",
]

[project.scripts]
my-tool = "my_tool.cli:main"

[project.urls]
Homepage = "https://github.com/acme/my-tool"
Issues = "https://github.com/acme/my-tool/issues"

[tool.ruff]
line-length = 100
target-version = "py311"
select = ["E", "F", "I", "N", "W", "UP", "B", "A", "C4", "DTZ", "T10", "EM", "G", "PIE", "PT", "RET", "SIM", "TCH"]
ignore = ["E501"]

[tool.mypy]
python_version = "3.11"
strict = true
ignore_missing_imports = true

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
addopts = "-v --cov=my_tool --cov-report=term-missing --cov-report=html"

[tool.coverage.run]
branch = true
source = ["src/my_tool"]
```

## Install in dev mode

```bash
# Create virtualenv
python3 -m venv .venv
source .venv/bin/activate

# Install with dev extras (editable)
pip install -e ".[dev]"

# Verify
my-tool --help
```

`-e` = editable install — code change reflect immediately.

## CLI với Click

```python
# src/my_tool/cli.py
import click
from . import __version__

@click.group()
@click.version_option(version=__version__)
@click.option("--debug", is_flag=True, help="Enable debug logging")
@click.pass_context
def main(ctx, debug):
    """DevOps automation tool."""
    ctx.ensure_object(dict)
    ctx.obj["debug"] = debug
    # Setup logging based on debug flag


@main.group()
def aws():
    """AWS commands."""
    pass


@aws.command("list-instances")
@click.option("--region", default="us-east-1", help="AWS region")
@click.option("--tag", multiple=True, help="Filter by tag (format: Key=Value)")
@click.option("--state", default="running", type=click.Choice(["running", "stopped", "all"]))
def list_instances(region, tag, state):
    """List EC2 instances."""
    from .aws.ec2 import list_ec2_instances

    instances = list_ec2_instances(region=region, tag_filters=list(tag), state=state)

    from rich.table import Table
    from rich.console import Console
    table = Table(title=f"EC2 Instances in {region}")
    table.add_column("ID")
    table.add_column("Name")
    table.add_column("Type")
    table.add_column("State")
    table.add_column("IP")

    for inst in instances:
        table.add_row(
            inst["id"], inst["name"], inst["type"],
            inst["state"], inst.get("ip", "")
        )

    Console().print(table)


@main.command()
@click.option("--env", type=click.Choice(["staging", "production"]), required=True)
@click.option("--version", required=True, help="Version to deploy")
@click.option("--dry-run", is_flag=True)
@click.pass_context
def deploy(ctx, env, version, dry_run):
    """Deploy app to environment."""
    from .commands.deploy import deploy_app
    deploy_app(env=env, version=version, dry_run=dry_run, debug=ctx.obj["debug"])


if __name__ == "__main__":
    main()
```

CLI tự generate help:

```bash
$ my-tool --help
Usage: my-tool [OPTIONS] COMMAND [ARGS]...

Options:
  --version    Show version
  --debug      Enable debug logging
  --help       Show this message and exit.

Commands:
  aws       AWS commands.
  deploy    Deploy app to environment.

$ my-tool aws --help
Usage: my-tool aws [OPTIONS] COMMAND [ARGS]...

  AWS commands.

Commands:
  list-instances  List EC2 instances.

$ my-tool aws list-instances --tag Environment=prod --state running
```

## Rich output

```python
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich.panel import Panel
from rich import print as rprint

console = Console()

# Color print
rprint("[bold red]Error:[/bold red] Connection failed")
rprint("[green]✓[/green] Deploy successful")

# Table
table = Table(title="Deploy Status")
table.add_column("Service", style="cyan")
table.add_column("Status", style="green")
table.add_row("vprofile", "running")
console.print(table)

# Progress spinner
with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}")) as progress:
    task = progress.add_task("Deploying...", total=None)
    # Long task
    deploy_app()

# Panel
console.print(Panel.fit("Deploy complete!", border_style="green"))
```

Beautiful CLI vs plain `print()`.

## Logging

```python
# src/my_tool/logging.py
import logging
from rich.logging import RichHandler

def setup_logging(level: str = "INFO"):
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(rich_tracebacks=True, show_path=False)]
    )

# Use
import logging
logger = logging.getLogger(__name__)

logger.info("Starting deploy")
logger.warning("Disk usage high")
logger.error("Deploy failed", exc_info=True)
```

Rich tracebacks = pretty + clickable links to source.

## Testing với pytest

`tests/test_cli.py`:

```python
import pytest
from click.testing import CliRunner
from my_tool.cli import main


@pytest.fixture
def runner():
    return CliRunner()


def test_version(runner):
    result = runner.invoke(main, ["--version"])
    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_help(runner):
    result = runner.invoke(main, ["--help"])
    assert result.exit_code == 0
    assert "DevOps automation tool" in result.output


def test_deploy_requires_env(runner):
    result = runner.invoke(main, ["deploy", "--version", "1.0.0"])
    assert result.exit_code != 0
    assert "Missing option" in result.output or "Error" in result.output


def test_deploy_dry_run(runner, mocker):
    mock_deploy = mocker.patch("my_tool.commands.deploy.deploy_app")

    result = runner.invoke(main, [
        "deploy",
        "--env", "staging",
        "--version", "1.0.0",
        "--dry-run"
    ])

    assert result.exit_code == 0
    mock_deploy.assert_called_once_with(
        env="staging",
        version="1.0.0",
        dry_run=True,
        debug=False
    )
```

`tests/test_aws.py`:

```python
import pytest
from unittest.mock import MagicMock, patch
from my_tool.aws.ec2 import list_ec2_instances


@pytest.fixture
def mock_boto3(mocker):
    """Mock boto3 client."""
    mock_client = MagicMock()
    mocker.patch("boto3.client", return_value=mock_client)
    return mock_client


def test_list_instances_running(mock_boto3):
    mock_boto3.describe_instances.return_value = {
        "Reservations": [{
            "Instances": [{
                "InstanceId": "i-xxx",
                "InstanceType": "t3.micro",
                "State": {"Name": "running"},
                "PrivateIpAddress": "10.0.1.5",
                "Tags": [{"Key": "Name", "Value": "web01"}]
            }]
        }]
    }

    instances = list_ec2_instances(region="us-east-1")

    assert len(instances) == 1
    assert instances[0]["id"] == "i-xxx"
    assert instances[0]["name"] == "web01"
```

### moto — mock AWS

```bash
pip install moto[ec2,s3]
```

```python
from moto import mock_aws
import boto3

@mock_aws
def test_create_instance():
    ec2 = boto3.client("ec2", region_name="us-east-1")
    resp = ec2.run_instances(ImageId="ami-xxx", MinCount=1, MaxCount=1, InstanceType="t3.micro")
    assert len(resp["Instances"]) == 1
```

Real boto3 calls intercepted by moto → test against simulated AWS.

### Coverage

```bash
pytest --cov=my_tool --cov-report=html
open htmlcov/index.html
```

## Code quality

### Ruff (linter + formatter, fastest)

```bash
ruff check src/                  # Lint
ruff check src/ --fix             # Auto-fix
ruff format src/                  # Format
```

### mypy (type checking)

```bash
mypy src/
```

### Pre-commit hooks

`.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.6
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.7.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests, types-pyyaml]
```

```bash
pre-commit install
pre-commit run --all-files
```

Mỗi commit → check tự động.

## Build + Distribute

### Build wheel

```bash
pip install build
python -m build
ls dist/
# my_tool-0.1.0-py3-none-any.whl
# my_tool-0.1.0.tar.gz
```

### Install local

```bash
pip install dist/my_tool-0.1.0-py3-none-any.whl
```

### Publish PyPI

```bash
pip install twine

# Test PyPI first
twine upload --repository testpypi dist/*

# Production PyPI
twine upload dist/*
```

Other user:

```bash
pip install my-tool
```

### Private PyPI / Nexus

```bash
twine upload --repository-url https://nexus.acme.com/repository/pypi-internal/ dist/*
```

`~/.pypirc`:

```ini
[distutils]
index-servers =
    pypi
    nexus

[nexus]
repository = https://nexus.acme.com/repository/pypi-internal/
username = __token__
password = <NEXUS_TOKEN>
```

### Distribute binary với PyInstaller

```bash
pip install pyinstaller
pyinstaller --onefile src/my_tool/__main__.py --name my-tool
ls dist/
# my-tool   (single executable)
```

Single binary → distribute to máy không có Python.

### Distribute Docker

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
RUN pip install hatchling && pip install .
COPY src/ src/
RUN pip install -e .
ENTRYPOINT ["my-tool"]
```

```bash
docker build -t my-tool:latest .
docker run --rm -it my-tool aws list-instances
```

## CI cho tool

`.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python: ['3.11', '3.12']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python }}
          cache: pip

      - run: pip install -e ".[dev]"
      - run: ruff check src/
      - run: mypy src/
      - run: pytest

      - uses: codecov/codecov-action@v4

  publish:
    needs: test
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install build
      - run: python -m build
      - uses: pypa/gh-action-pypi-publish@release/v1
```

Tag `v0.1.0` → auto-publish PyPI với OIDC.

## Tổng kết phase 20

4 bài cover:
1. Python overview + setup + virtualenv.
2. Syntax đầy đủ.
3. Automation (subprocess, requests, boto3, parallel).
4. CLI tool + packaging + testing.

Skills:
- Viết tool DevOps Python production-grade.
- CLI với Click + Rich.
- Test pytest + mock + moto.
- Package + distribute PyPI / Nexus / Docker.
- CI pipeline cho Python project.

## Tóm tắt bài 4

- **`pyproject.toml`** modern config.
- **`src/` layout** avoid import bug.
- **Click** declarative CLI > argparse.
- **Rich** beautiful output (table, progress, color).
- **pytest** + **moto** + **mock** = test mọi thứ.
- **Ruff** + **mypy** + **pre-commit** = code quality.
- Build wheel → distribute PyPI / Nexus / PyInstaller / Docker.
- CI pipeline với matrix Python version.

**Phase kế tiếp** → [Phase 21 — Terraform](../phase-21-terraform/01-terraform-basics.md)
