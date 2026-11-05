# Alexa Smart Home Integration Guide

Control your Domotic-AI devices by voice ("Alexa, turn on the living room
light"). Each **organization** runs its own private Alexa skill: the org admin
(the user with `is_org_admin`) registers a skill under their own Amazon
Developer account and connects it to the platform's built-in OAuth2 server.
One integration per organization; every member of the organization can then
link their own Alexa account and control the devices of the homes they belong
to.

**No Amazon certification is required** — a development skill works for the
Amazon account that created it, and other members can be invited as beta
testers.

## How it works

```
Echo device ──▶ Alexa cloud ──▶ AWS Lambda (thin proxy, alexa-lambda/index.mjs)
                                    │ POST directive + Bearer token
                                    ▼
              Domotic-AI cloud  /api/v1/alexa/directives
                (discovery, control, state — all logic lives here)
                                    │ NATS → mqtt-core → MQTT → device
```

Account linking uses the platform's OAuth2 endpoints
(`/api/v1/alexa/oauth/authorize` + `/token`). Alexa exchanges the user's
consent for tokens; every directive then carries a bearer token that resolves
to the linked user and their organization, so discovery and control are
automatically scoped to the homes that user belongs to.

## Prerequisites

- You are the **organization admin** in Domotic-AI (`is_org_admin`).
- The Domotic-AI cloud is reachable over public HTTPS (e.g. the Cloudflare
  Tunnel behind `PUBLIC_APP_URL`).
- An Amazon account (the same one your Echo devices use), with access to the
  [Amazon Developer Console](https://developer.amazon.com/alexa/console/ask)
  and the [AWS Console](https://console.aws.amazon.com/).

## Step 1 — Create the integration in Domotic-AI

1. Settings → **Integrations** → **Amazon Alexa** card → *Create integration*.
2. Copy the **Client ID** and **Client secret** (the secret is shown **only
   once**; you can rotate it later).
3. Note the **Authorization URI** and **Access Token URI** shown on the card:
   - `https://<your-domain>/api/v1/alexa/oauth/authorize`
   - `https://<your-domain>/api/v1/alexa/oauth/token`

## Step 2 — Create the Smart Home skill

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) →
   *Create Skill*.
2. Name it (e.g. "My Home"), pick the skill's default language (must match
   your Echo's language), choose model **Smart Home**, and *Create skill*.
3. Under *Smart Home service endpoint* leave the payload version at **v3**.
   You'll fill the endpoint ARN in Step 3.
4. Note the **Skill ID** (`amzn1.ask.skill.…`).

## Step 3 — Create the Lambda proxy

Smart Home skills only accept an AWS Lambda as endpoint; the Lambda here is a
~60-line proxy that forwards directives to your cloud verbatim.

1. AWS Console → Lambda → *Create function* (Author from scratch):
   - Runtime **Node.js 22** (or 20), architecture arm64 or x86_64.
   - Region: use `eu-west-1` (Ireland) for skills in European languages,
     `us-east-1` for English (US) — Alexa requires specific regions.
2. Replace the generated code with the contents of
   [`alexa-lambda/index.mjs`](../alexa-lambda/index.mjs) and *Deploy*.
3. Configuration → Environment variables → add
   `PUBLIC_APP_URL = https://<your-domain>`.
   Configuration → General configuration → **Timeout = 8 s**. The AWS default
   (3 s) is shorter than the proxy's own 7 s budget, so slow cloud replies would
   be killed by Lambda before the proxy can answer with a proper ErrorResponse.
4. Add trigger → **Alexa** → *Smart Home* → paste the **Skill ID** from
   Step 2.
5. Copy the **Function ARN** (top right) and paste it into the skill's
   *Smart Home service endpoint* → *Default endpoint* → Save.

## Step 4 — Configure Account Linking

In the skill: *Account Linking* →

| Field | Value |
|---|---|
| Auth grant type | **Auth Code Grant** |
| Web Authorization URI | `https://<your-domain>/api/v1/alexa/oauth/authorize` |
| Access Token URI | `https://<your-domain>/api/v1/alexa/oauth/token` |
| Client ID / Secret | from Step 1 |
| Client authentication scheme | HTTP Basic (credentials in request body also works) |
| Scope | leave empty |

Save, then copy the **three Alexa Redirect URLs** the console shows
(`https://layla.amazon.com/…`, `https://pitangui.amazon.com/…`,
`https://alexa.amazon.co.jp/…`) and paste them into the Domotic-AI Alexa card
(*Alexa redirect URLs*, one per line) and save. Authorization requests from
any other redirect URL are rejected.

## Step 5 — Link and discover

1. In the **Alexa app** (logged in with the same Amazon account): More →
   Skills & Games → Your Skills → **Dev** → your skill → *Enable to use*.
2. The Domotic-AI login/consent page opens; sign in and press **Allow**.
3. Run device discovery ("Alexa, discover devices" or from the app). Every
   supported device of the homes you belong to appears, plus one *scene* per
   learned IR command ("Alexa, turn on ⟨device⟩ ⟨command⟩").

## Adding other organization members

A development skill is only visible to the developer's Amazon account. To let
other members use it:

1. Developer Console → your skill → *Distribution* → complete the minimal
   store fields → *Availability* → **Beta Test** → add their Amazon e-mail
   addresses.
2. They accept the invite, enable the skill in their Alexa app, and link with
   **their own** Domotic-AI account. Discovery only returns devices of the
   homes each user is assigned to (`UserHome`).

## What's supported (v1)

| Device capability | Alexa interface | Utterance example |
|---|---|---|
| on/off (`state`/`switch`, media `power`) | PowerController | "turn on the lamp" |
| `brightness` | BrightnessController | "set lamp to 50%" |
| `color` | ColorController | "make the lamp red" |
| `color_temp` | ColorTemperatureController | "set the lamp to warm white" |
| thermostat (`system_mode` + setpoint) | ThermostatController | "set heating to 21 degrees" |
| lock (LOCK/UNLOCK) | LockController | "lock the front door" |
| `temperature` (readable) | TemperatureSensor | "what's the bedroom temperature?" |
| `contact` (readable) | ContactSensor | (routines / status) |
| `occupancy` / `presence` | MotionSensor | (routines / status) |
| learned IR command | SceneController | "turn on TV volume up" |
| all endpoints | EndpointHealth | offline devices report unreachable |

State queries are answered from the platform's last reported state
(`SensorDataLast`); commands respond synchronously and are audited in
`command_executions` with `source = 'alexa'`. Proactive state push (Alexa app
updating in real time) is a planned v2. The skill answers `AcceptGrant` and
stores the grant code, but does not yet exchange it with Login with Amazon;
those codes expire within minutes, so enabling v2 will require users to re-link.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Linking fails with "unable to link" | Redirect URLs not saved in the card, or client secret mismatch — rotate the secret and update the skill. |
| Login page loops | The `next` parameter is dropped: make sure you open the skill-initiated link from the Alexa app, and that `PUBLIC_APP_URL` matches the SPA origin. |
| 401 `INVALID_AUTHORIZATION_CREDENTIAL` on directives | Access token expired (1 h) — Alexa should refresh automatically; if the refresh token was revoked (unlink / rotate / delete), re-link the account. |
| Discovery returns no devices | The linked user has no `UserHome` membership, devices are disabled, or their capabilities don't map (see table above). |
| `ENDPOINT_UNREACHABLE` | `Device.online = false` — check the device/bridge. |
| `RATE_LIMIT_EXCEEDED` | More than 2 commands/second to one device. |
| Lambda test works but voice fails | Lambda region doesn't match the skill language, or the Alexa Smart Home trigger has the wrong Skill ID. |

To debug end to end: check the Lambda's CloudWatch logs, then the API logs
(`AlexaDirectiveService`), then `command_executions` (`source='alexa'`).
