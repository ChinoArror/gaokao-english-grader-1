import { Fetcher } from "@cloudflare/workers-types";

export interface Env {
    ASSETS: Fetcher;
    API_KEY?: string;
    API_DOMAIN?: string;
    MODEL_NAME?: string;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // Handle OPTIONS request for CORS
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                },
            });
        }

        // API Handling
        if (request.method === "POST" && url.pathname === "/api/grade") {
            try {
                const body: any = await request.json();

                const apiKey = env.API_KEY || "";
                const apiDomain = env.API_DOMAIN || "generativelanguage.googleapis.com";

                if (!apiKey) {
                    return new Response(JSON.stringify({ error: "Configuration Error: API_KEY is missing in worker environment." }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                let apiUrl = "";
                const modelName = body.model || env.MODEL_NAME || 'gemini-2.0-flash-exp';

                if (apiDomain.startsWith("http")) {
                    apiUrl = `${apiDomain}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                } else {
                    apiUrl = `https://${apiDomain}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                }

                const response = await fetch(apiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body.payload || body)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    // Pass through the upstream status
                    return new Response(JSON.stringify({ error: `Gemini API Error: ${response.status} ${response.statusText}`, details: errorText }), {
                        status: response.status,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                const data = await response.json();
                return new Response(JSON.stringify(data), {
                    headers: { "Content-Type": "application/json" }
                });

            } catch (e: any) {
                return new Response(JSON.stringify({ error: e.message || "Internal Server Error" }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" }
                });
            }
        }

        // Static Assets Fallback
        // If the request didn't match the API, serve static assets.
        try {
            return await env.ASSETS.fetch(request);
        } catch (e) {
            return new Response("Not Found", { status: 404 });
        }
    }
};
