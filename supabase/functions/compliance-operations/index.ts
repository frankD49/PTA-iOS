import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAILS = ["precioustotsacademy@outlook.com","precioustotsacademy@gmail.com","admin@precioustotsacademy.com","2frankincense4m@gmail.com"];
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const failure = (operation: string, error: unknown) => new Error(`${operation}: ${error instanceof Error ? error.message : String(error)}`);
const check = (operation: string, error: unknown) => { if (error) throw failure(operation,error); };

async function finalizeDeletion(admin: any, request: any) {
  const userId=request.target_user_id||request.user_id;
  try {
    if (!userId) throw new Error("Deletion request has no user ID");
    if (["queued","failed"].includes(request.processing_step)) {
      const {error}=await admin.from("chat_messages").update({user_id:null,sender_name:"Deleted member"}).eq("user_id",userId);
      check("anonymize chat messages",error);
      const {error:stepError}=await admin.from("account_deletion_requests").update({processing_step:"profile_anonymized"}).eq("id",request.id);
      check("save profile anonymization checkpoint",stepError); request.processing_step="profile_anonymized";
    }
    if (request.processing_step==="profile_anonymized") {
      for (const category of ["photo","video","pdf"]) {
        const bucket=admin.storage.from("pta_uploads");
        const {data:objects,error:listError}=await bucket.list(`${category}/${userId}`,{limit:1000});
        check(`list ${category} media`,listError);
        if (objects?.length) { const {error:removeError}=await bucket.remove(objects.map((o:any)=>`${category}/${userId}/${o.name}`)); check(`delete ${category} media`,removeError); }
      }
      const {error}=await admin.from("account_deletion_requests").update({processing_step:"media_deleted"}).eq("id",request.id);
      check("save media deletion checkpoint",error); request.processing_step="media_deleted";
    }
    if (request.processing_step==="media_deleted") {
      const {error}=await admin.from("legal_acceptances").delete().eq("user_id",userId); check("delete legal acceptances",error);
      const {error:blocksError}=await admin.from("user_blocks").delete().or(`blocker_id.eq.${userId},blocked_user_id.eq.${userId}`); check("delete user blocks",blocksError);
      const {error:stepError}=await admin.from("account_deletion_requests").update({processing_step:"compliance_deleted"}).eq("id",request.id);
      check("save compliance deletion checkpoint",stepError); request.processing_step="compliance_deleted";
    }
    if (request.processing_step==="compliance_deleted") {
      const {error}=await admin.auth.admin.deleteUser(userId); check("delete Auth user",error);
      request.processing_step="auth_deleted";
    }
    const {error:completeError}=await admin.from("account_deletion_requests").update({status:"completed",processing_step:"complete",completed_at:new Date().toISOString(),next_attempt_at:null,last_error:null}).eq("id",request.id);
    check("complete deletion request",completeError);
    return {requestId:request.id,userId,status:"completed"};
  } catch (error) {
    const {error:recordError}=await admin.rpc("record_deletion_failure",{request_id:request.id,failure:error instanceof Error?error.message:String(error)});
    if (recordError) console.error("Unable to record deletion failure",request.id,recordError);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers:corsHeaders});
  try {
    const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
    const authorization=req.headers.get("Authorization");
    const body=await req.json();
    const admin=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const cronHeader=req.headers.get("x-cron-secret");
    const {data:cronAuthorized,error:cronAuthError}=cronHeader ? await admin.rpc("verify_compliance_cron_secret",{candidate:cronHeader}) : {data:false,error:null};
    if (cronAuthError) console.error("Unable to verify scheduler authentication",cronAuthError);
    if (body.action==="processDueDeletions") {
      if (!cronAuthorized) return reply({error:"Scheduler authentication required"},401);
      const batchSize=Math.max(1,Math.min(Number(body.batchSize)||25,100));
      const {data:requests,error:claimError}=await admin.rpc("claim_due_account_deletions",{batch_size:batchSize});
      if (claimError) return reply({error:`Unable to claim deletion requests: ${claimError.message}`},500);
      const results=[];
      for (const request of requests||[]) {
        try { results.push(await finalizeDeletion(admin,request)); }
        catch (error) { results.push({requestId:request.id,userId:request.user_id,status:"retry_scheduled",error:error instanceof Error?error.message:String(error)}); }
      }
      return reply({success:true,processed:results.length,results});
    }
    if (!authorization) return reply({error:"Authentication required"},401);
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}}});
    const {data:identity,error:identityError}=await userClient.auth.getUser();
    if (identityError || !identity.user) return reply({error:"Invalid or expired session"},401);
    const user=identity.user;
    const isAdmin=ADMIN_EMAILS.includes((user.email||"").toLowerCase()) || user.app_metadata?.is_admin===true;

    if (body.action === "requestDeletion") {
      const scheduledFor=new Date(Date.now()+14*86400000).toISOString();
      const {data:request,error}=await admin.from("account_deletion_requests").upsert({user_id:user.id,target_user_id:user.id,status:"pending",processing_step:"queued",requested_at:new Date().toISOString(),scheduled_for:scheduledFor,next_attempt_at:scheduledFor,last_error:null},{onConflict:"user_id,status"}).select().single();
      if (error) return reply({error:error.message},400);
      const {error:statusError}=await admin.from("account_status").upsert({user_id:user.id,status:"deletion_pending",reason:"User requested deletion",updated_at:new Date().toISOString(),updated_by:user.id});
      if (statusError) { await admin.from("account_deletion_requests").delete().eq("id",request.id); return reply({error:`Unable to revoke account access: ${statusError.message}`},500); }
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
      const lookups=await Promise.all(ids.map(async id=>({id,result:await admin.auth.admin.getUserById(id)})));
      for (const {id,result} of lookups) { if(result.error) return reply({error:`Unable to load report participant: ${result.error.message}`},500); if(result.data.user)users[id]={email:result.data.user.email,name:result.data.user.user_metadata?.full_name||result.data.user.user_metadata?.first_name}; }
      return reply({reports,users});
    }

    if (body.action === "moderateReport") {
      const {reportId,decision,notes}=body;
      if (!reportId || !["hide_message","remove_message","warn_user","suspend_user","dismiss"].includes(decision)) return reply({error:"Invalid moderation decision"},400);
      const {data:report,error}=await admin.from("content_reports").select("*").eq("id",reportId).single();
      if (error || !report) return reply({error:"Report not found"},404);
      if ((decision==="hide_message" || decision==="remove_message") && report.message_id) {
        const {error}=await admin.from("chat_messages").update({moderation_status:decision==="hide_message"?"hidden":"removed",deleted_at:new Date().toISOString(),deleted_by:user.id}).eq("id",report.message_id); if(error)return reply({error:error.message},500);
      }
      if (decision==="warn_user") { const {error}=await admin.from("account_status").upsert({user_id:report.reported_user_id,status:"active",reason:`Warning: ${notes||report.reason}`,updated_at:new Date().toISOString(),updated_by:user.id}); if(error)return reply({error:error.message},500); }
      if (decision==="suspend_user") {
        const {error}=await admin.from("account_status").upsert({user_id:report.reported_user_id,status:"suspended",reason:notes||report.reason,updated_at:new Date().toISOString(),updated_by:user.id}); if(error)return reply({error:error.message},500);
        const {data:target,error:targetError}=await admin.auth.admin.getUserById(report.reported_user_id); if(targetError)return reply({error:targetError.message},500);
        if (target.user) { const {error:authError}=await admin.auth.admin.updateUserById(report.reported_user_id,{app_metadata:{...target.user.app_metadata,account_status:"suspended"}}); if(authError)return reply({error:authError.message},500); }
      }
      const status=decision==="dismiss"?"dismissed":"resolved";
      const {error:updateError}=await admin.from("content_reports").update({status,moderator_notes:notes||null,resolved_at:new Date().toISOString(),resolved_by:user.id}).eq("id",reportId);
      if (updateError) return reply({error:updateError.message},500);
      return reply({success:true,status});
    }

    if (body.action === "finalizeDeletion") {
      const {userId}=body;
      if (!userId) return reply({error:"User ID required"},400);
      const {data:request,error:requestError}=await admin.from("account_deletion_requests").select("*").eq("user_id",userId).in("status",["pending","processing"]).maybeSingle();
      if(requestError)return reply({error:requestError.message},500);
      if (!request || new Date(request.scheduled_for)>new Date()) return reply({error:"Deletion is not due"},409);
      const {error:claimError}=await admin.from("account_deletion_requests").update({status:"processing",attempt_count:(request.attempt_count||0)+1,last_attempt_at:new Date().toISOString()}).eq("id",request.id); if(claimError)return reply({error:claimError.message},500);
      return reply({success:true,result:await finalizeDeletion(admin,{...request,status:"processing",attempt_count:(request.attempt_count||0)+1})});
    }

    return reply({error:"Unknown action"},400);
  } catch (error) {
    console.error(error);
    return reply({error:"Internal server error"},500);
  }
});
