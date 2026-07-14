# Provider attempts

## Claude CLI

- Result: failed before image processing
- Failure category: `provider-authentication`
- Error: HTTP 401, invalid authentication credentials
- Image bytes sent: none
- Cost: $0.00

The CLI's local status reported a logged-in account, but both direct `claude -p`
and the canonical `omx ask claude` path returned the same authentication error.
The local CLIPSeg run was used instead so the fixed synthetic corpus remained
fully local.
