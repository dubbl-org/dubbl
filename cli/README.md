# Dubbl CLI

Python 3 client for the Dubbl REST API. Uses only the standard library.

Point it at a deployment with `--base-url`, the `DUBBL_URL` environment variable, or `base_url` in `credentials/dubbl.json`. The base URL must be an HTTPS origin. Store a key created under Settings → API keys in `credentials/dubbl.json` as `{"api_key":"dk_..."}`; an `organization_id` may live there too. Credentials are ignored by Git. Never include them in command arguments or output. The CLI refuses HTTP redirects so an API credential cannot follow a redirect to another origin.

A deployment can sit behind Cloudflare Access, and then a caller that is not a person also sets `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` (environment or `credentials/dubbl.json`). The service token only passes the edge; the API key is what authorises, and it resolves to that member's own role and audit trail. Give each person their own token and key, so revoking one does not stop the others. MCP clients do not use a service token: `/api/mcp` has to answer 401 with its OAuth discovery metadata, and Access answers 302 instead.

Run `./dubbl whoami` to verify the organization. Use `./dubbl list accounts`, `./dubbl list expenses`, `./dubbl get expenses/ID`, or `./dubbl list contacts --query search=Hetzner`. Lists traverse all pages.

Use `./dubbl create expenses --file claim.json` and `./dubbl patch expenses/ID --file changes.json`. JSON follows the API schema. Expense create/update item `amount` is a decimal in currency units, such as 12.50 EUR, while response `amount` and `totalAmount` are integer minor units, such as 1250. Other endpoints may require minor units in requests. Check the endpoint schema before creating financial records. Always set `currencyCode` on expense claims. No currency conversion is performed by this client.

`./dubbl request METHOD endpoint --file body.json` exposes other /api/v1 endpoints. This includes consequential writes, so review the body before invoking it. The client does not automatically retry writes. General create commands do not deduplicate. Accounting import scripts must reconcile existing resources before creating records.

`./dubbl upload invoice.pdf --folder FOLDER_ID --entity-type expense --entity-id CLAIM_ID` creates document metadata, uploads to Dubbl's signed storage URL without sending the API key to storage, then downloads the document and verifies its checksum. Repeating the same file/name/folder/entity verifies and reuses it. It stops on conflicting bytes, ambiguous metadata or incomplete existing uploads. An incomplete upload may require repair in Dubbl. Signed URLs are never printed by upload/download commands.

`./dubbl download DOCUMENT_ID --output invoice.pdf` verifies a document can be retrieved. It refuses to overwrite an existing file.

Run the tests with `python3 -m unittest discover` in this directory. Import scripts built on this client keep their own data outside this repository.
