import { NextResponse } from "next/server";

const backendUrl = process.env.FASTAPI_BACKEND_URL || process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL;

export async function GET() {
	if (!backendUrl) {
		return NextResponse.json(
			{ error: "FASTAPI_BACKEND_URL is not configured" },
			{ status: 500 }
		);
	}

	try {
		const response = await fetch(`${backendUrl}/api/v1/config/auth-type`, {
			cache: "no-store",
			headers: {
				Accept: "application/json",
			},
		});

		const data = await response.json().catch(() => null);

		if (!response.ok || !data) {
			return NextResponse.json({ auth_type: "GOOGLE" }, { status: 200 });
		}

		return NextResponse.json(data, { status: 200 });
	} catch (error) {
		return NextResponse.json({ auth_type: "GOOGLE" }, { status: 200 });
	}
}
