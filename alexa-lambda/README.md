# alexa-lambda — Smart Home skill endpoint proxy

Amazon requires Smart Home skills to use an AWS Lambda as their endpoint.
[`index.mjs`](index.mjs) is a dependency-free proxy: it extracts the bearer
token from the directive, POSTs the directive **verbatim** to
`${PUBLIC_APP_URL}/api/v1/alexa/directives`, and returns the response
verbatim. All discovery/control/state logic lives in `apps/api` — this
function should almost never need redeploying.

## Deploy

1. Lambda → *Create function* → Node.js 22 (or 20).
   Region: `eu-west-1` for European skill languages, `us-east-1` for en-US.
2. Paste `index.mjs` as the function code and *Deploy*.
3. Environment variable: `PUBLIC_APP_URL = https://<your-domain>`.
   General configuration → **Timeout = 8 s** (the 3 s default is shorter than
   the proxy's 7 s budget).
4. Add trigger → Alexa → Smart Home → your Skill ID.
5. Copy the Function ARN into the skill's *Default endpoint*.

## Test from the AWS console

Use a real directive as the test event, e.g. discovery (replace the token
with an access token from the OAuth flow):

```json
{
  "directive": {
    "header": {
      "namespace": "Alexa.Discovery",
      "name": "Discover",
      "payloadVersion": "3",
      "messageId": "test-1"
    },
    "payload": { "scope": { "type": "BearerToken", "token": "alexaat_…" } }
  }
}
```

Full setup runbook: [docs/alexa-integration-guide.md](../docs/alexa-integration-guide.md).
