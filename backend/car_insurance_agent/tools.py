import os 

from dotenv import load_dotenv 
from google.adk.tools.apihub_tool.apihub_toolset import APIHubToolset
from google.adk.tools.apiihub_tool.clients.secret_client import (
    SecretManagerClient,
)
from google.adk.tools.openapi_tool.auth.auth_helpers import (
    token_to_scheme_credential
)

load_dotenv()

secret_client = SecretManagerClient()
api_hub_toolset = APIHubToolset.from_defaults(
    secret_client=secret_client,
    registry_url=""
    auth_scheme_credential_mapper=lambda sec_def: token_to_scheme_credential(
        api_key=os.getenv("API_KEY"), 
        scheme_name=sec_def.name,
        secret_client=secret_client
    )
)