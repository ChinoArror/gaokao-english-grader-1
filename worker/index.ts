import { Fetcher } from "@cloudflare/workers-types";

export interface Env {
    ASSETS: Fetcher;
    API_KEY?: string;
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

                // Define model explicitly as requested
                const modelName = "gemini-3-pro-preview";

                // Construct standard Google API URL
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

                if (!apiKey) {
                    return new Response(JSON.stringify({ error: "Configuration Error: API_KEY is missing in worker environment." }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                const response = await fetch(apiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body)
                });

                // Pass through the upstream status and body
                const responseData = await response.text();

                return new Response(responseData, {
                    status: response.status,
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
        try {
            return await env.ASSETS.fetch(request);
        } catch (e) {
            return new Response("Not Found", { status: 404 });
        }
    }
};
