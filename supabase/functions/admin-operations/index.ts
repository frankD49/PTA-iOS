// Supabase Edge Function: admin-operations
// Handles member management securely using the service_role key.
// Deploy with: supabase functions deploy admin-operations --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAILS = [
  "precioustotsacademy@outlook.com",
  "precioustotsacademy@gmail.com",
  "admin@precioustotsacademy.com",
  "2frankincense4m@gmail.com",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashInviteCode(code: string) {
  const bytes = new TextEncoder().encode(code.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = new Uint8Array(8);
  crypto.getRandomValues(random);
  return Array.from(random, (value) => alphabet[value % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get the caller's JWT from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    // Create a client with the caller's token to verify their identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const callerEmail = userData.user.email?.toLowerCase();

    // Create admin client with service_role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action } = body;

    // Any authenticated requester may redeem the code issued specifically to their account.
    if (action === "verifyInviteCode") {
      const inviteCode = String(body.inviteCode || "").trim().toUpperCase();
      if (!inviteCode) return jsonResponse({ error: "Invite code is required." }, 400);
      const storedHash = userData.user.app_metadata?.invite_code_hash;
      if (!storedHash || userData.user.app_metadata?.invite_status !== "issued") {
        return jsonResponse({ error: "Your invite request is still awaiting admin approval." }, 403);
      }
      if (await hashInviteCode(inviteCode) !== storedHash) {
        return jsonResponse({ error: "That invite code is invalid." }, 403);
      }
      const { data, error } = await adminClient.auth.admin.updateUserById(userData.user.id, {
        app_metadata: { ...userData.user.app_metadata, invite_status: "approved", invite_code_hash: null },
      });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, userId: data.user.id });
    }

    const callerIsAdmin = !!callerEmail && (ADMIN_EMAILS.includes(callerEmail) || userData.user.app_metadata?.is_admin === true);
    if (!callerIsAdmin) {
      return jsonResponse({ error: "Unauthorized: admin access required" }, 403);
    }

    // ---- LIST USERS ----
    if (action === "listUsers") {
      const { data, error } = await adminClient.auth.admin.listUsers({
        perPage: 100,
      });
      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }
      // Return sanitized user list
      const users = data.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        user_metadata: u.user_metadata,
        app_metadata: {
          invite_status: u.app_metadata?.invite_status,
          is_admin: u.app_metadata?.is_admin === true,
        },
      }));
      return jsonResponse({ users });
    }

    // ---- ISSUE INVITE CODE FOR A PENDING ACCOUNT ----
    if (action === "issueInviteCode") {
      const { userId } = body;
      if (!userId) return jsonResponse({ error: "User ID is required" }, 400);
      const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(userId);
      if (targetError || !target.user) return jsonResponse({ error: "User not found" }, 404);
      const targetEmail = target.user.email?.toLowerCase();
      if (targetEmail && ADMIN_EMAILS.includes(targetEmail)) {
        return jsonResponse({ error: "Administrators do not require access codes" }, 400);
      }
      if (target.user.app_metadata?.invite_status === "approved") {
        return jsonResponse({ error: "This account is already an active member" }, 409);
      }
      const inviteCode = createInviteCode();
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...target.user.app_metadata,
          invite_status: "issued",
          invite_code_hash: await hashInviteCode(inviteCode),
        },
      });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, inviteCode });
    }

    // ---- PROMOTE AN APPROVED MEMBER TO ADMINISTRATOR ----
    if (action === "promoteAdmin") {
      const { userId } = body;
      if (!userId) return jsonResponse({ error: "User ID is required" }, 400);
      const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(userId);
      if (targetError || !target.user) return jsonResponse({ error: "User not found" }, 404);
      if (target.user.app_metadata?.invite_status !== "approved") {
        return jsonResponse({ error: "Only approved members can become administrators" }, 409);
      }
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: { ...target.user.app_metadata, is_admin: true },
      });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ---- DELETE USER ----
    if (action === "deleteUser") {
      const { userId } = body;
      if (!userId) {
        return jsonResponse({ error: "User ID is required" }, 400);
      }
      // Prevent deleting admins
      const { data: targetUser } = await adminClient.auth.admin.getUserById(userId);
      if (targetUser?.user && (targetUser.user.app_metadata?.is_admin === true || (targetUser.user.email && ADMIN_EMAILS.includes(targetUser.user.email.toLowerCase())))) {
        return jsonResponse({ error: "Cannot remove an admin user" }, 403);
      }
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }
      return jsonResponse({ success: true, message: "Member removed successfully" });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("Edge function error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

