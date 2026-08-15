import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAILS = ["precioustotsacademy@outlook.com","precioustotsacademy@gmail.com","admin@precioustotsacademy.com","2frankincense4m@gmail.com"];
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers:{...corsHeaders,"Content-Type":"application/json"}});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers:corsHeaders});
  try {
    const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
    const authorization=req.headers.get("Authorization");
    if (!authorization) return reply({error:"Authentication required"},401);
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}}});
    const {data:identity,error:identityError}=await userClient.auth.getUser();
    if (identityError || !identity.user) return reply({error:"Invalid or expired session"},401);
    const user=identity.user;
    const admin=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const body=await req.json();
    const isAdmin=ADMIN_EMAILS.includes((user.email||"").toLowerCase()) || user.app_metadata?.is_admin===true;

    if (body.action === "requestDeletion") {
      const scheduledFor=new Date(Date.now()+14*86400000).toISOString();
      const {data:request,error}=await admin.from("account_deletion_requests").upsert({user_id:user.id,status:"pending",requested_at:new Date().toISOString(),scheduled_for:scheduledFor},{onConflict:"user_id,status"}).select().single();
      if (error) return reply({error:error.message},400);
      await admin.from("account_status").upsert({user_id:user.id,status:"deletion_pending",reason:"User requested deletion",updated_at:new Date().toISOString(),updated_by:user.id});
      const {error:updateError}=await admin.auth.admin.updateUserById(user.id,{app_metadata:{...user.app_metadata,account_status:"deletion_pending"}});
      if (updateError) return reply({error:updateError.message},500);
      return reply({success:true,requestId:request.id,scheduledFor});
    }

    if (!isAdmin) return reply({error:"Administrator access required"},403);

    if (body.action === "listReports") {
      const {data:reports,error}=await admin.from("content_reports").select("*,chat_messages(body,sender_name,created_at)").order("created_at",{ascending:false}).limit(200);
      if (error) return reply({error:error.message},500);
      const ids=[...new Set((reports||[]).flatMap((r:any)=>[r.reporter_id,r.reported_user_id]).filter(Boolean))];
      const users:Record<string,{email?:string;name?:string}>={};
      await Promise.all(ids.map(async id=>{const {data}=await admin.auth.admin.getUserById(id);if(data.user)users[id]={email:data.user.email,name:data.user.user_metadata?.full_name||data.user.user_metadata?.first_name};}));
      return reply({reports,users});
    }

    if (body.action === "moderateReport") {
      const {reportId,decision,notes}=body;
      if (!reportId || !["hide_message","remove_message","warn_user","suspend_user","dismiss"].includes(decision)) return reply({error:"Invalid moderation decision"},400);
      const {data:report,error}=await admin.from("content_reports").select("*").eq("id",reportId).single();
      if (error || !report) return reply({error:"Report not found"},404);
      if ((decision==="hide_message" || decision==="remove_message") && report.message_id) {
        await admin.from("chat_messages").update({moderation_status:decision==="hide_message"?"hidden":"removed",deleted_at:new Date().toISOString(),deleted_by:user.id}).eq("id",report.message_id);
      }
      if (decision==="warn_user") await admin.from("account_status").upsert({user_id:report.reported_user_id,status:"active",reason:`Warning: ${notes||report.reason}`,updated_at:new Date().toISOString(),updated_by:user.id});
      if (decision==="suspend_user") {
        await admin.from("account_status").upsert({user_id:report.reported_user_id,status:"suspended",reason:notes||report.reason,updated_at:new Date().toISOString(),updated_by:user.id});
        const {data:target}=await admin.auth.admin.getUserById(report.reported_user_id);
        if (target.user) await admin.auth.admin.updateUserById(report.reported_user_id,{app_metadata:{...target.user.app_metadata,account_status:"suspended"}});
      }
      const status=decision==="dismiss"?"dismissed":"resolved";
      const {error:updateError}=await admin.from("content_reports").update({status,moderator_notes:notes||null,resolved_at:new Date().toISOString(),resolved_by:user.id}).eq("id",reportId);
      if (updateError) return reply({error:updateError.message},500);
      return reply({success:true,status});
    }

    if (body.action === "finalizeDeletion") {
      const {userId}=body;
      if (!userId) return reply({error:"User ID required"},400);
      const {data:request}=await admin.from("account_deletion_requests").select("*").eq("user_id",userId).in("status",["pending","processing"]).maybeSingle();
      if (!request || new Date(request.scheduled_for)>new Date()) return reply({error:"Deletion is not due"},409);
      await admin.from("account_deletion_requests").update({status:"processing"}).eq("id",request.id);
      await admin.from("chat_messages").update({user_id:null,sender_name:"Deleted member"}).eq("user_id",userId);
      for (const category of ["photo","video","pdf"]) {
        const {data:objects}=await admin.storage.from("pta_uploads").list(`${category}/${userId}`,{limit:1000});
        if (objects?.length) await admin.storage.from("pta_uploads").remove(objects.map(o=>`${category}/${userId}/${o.name}`));
      }
      await admin.from("legal_acceptances").delete().eq("user_id",userId);
      await admin.from("account_deletion_requests").update({status:"completed",completed_at:new Date().toISOString()}).eq("id",request.id);
      const {error}=await admin.auth.admin.deleteUser(userId);
      if (error) return reply({error:error.message},500);
      return reply({success:true});
    }

    return reply({error:"Unknown action"},400);
  } catch (error) {
    console.error(error);
    return reply({error:"Internal server error"},500);
  }
});

