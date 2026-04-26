from setuptools import setup, find_namespace_packages

setup(
    name="cli-anything-superr",
    version="0.1.0",
    description="CLI for Superr Workflow Builder",
    author="Superr Team",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    package_dir={"": "."},
    install_requires=[
        "click>=8.0.0",
        "rich>=13.0.0",
        "jsonschema>=4.0.0",
        "python-dotenv>=1.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "black>=23.0.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "superr=cli_anything.superr.superr_cli:cli",
        ],
    },
    python_requires=">=3.9",
)
