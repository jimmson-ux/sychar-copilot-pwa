import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { swap_request_id, action_taken } = await req.json();
    if (!swap_request_id || !action_taken) throw new Error("swap_request_id and action_taken required");

    const validActions = [
      "Approved_Swapped", "Rejected_By_Deputy", "Declined_By_Peer",
      "Pending_Deputy_Authorization",
    ];
    if (!validActions.includes(action_taken)) {
      throw new Error(`Invalid action_taken: ${action_taken}`);
    }

    // Fetch the swap request
    const { data: swapReq, error: fetchErr } = await supabase
      .from("tod_swap_requests")
      .select("*")
      .eq("id", swap_request_id)
      .single();

    if (fetchErr || !swapReq) throw new Error("Swap request not found");

    if (action_taken === "Approved_Swapped") {
      // Atomic teacher swap on the master schedule
      const { error: swapErr } = await supabase.rpc("execute_atomic_duty_swap", {
        p_req_id: swapReq.requester_schedule_id,
        p_target_id: swapReq.target_schedule_id,
        p_req_teacher: swapReq.requester_id,
        p_target_teacher: swapReq.target_teacher_id,
      });
      if (swapErr) throw swapErr;

      // Mark both schedules as Swapped_Authorized
      await supabase
        .from("tod_master_schedule")
        .update({ shift_status: "Swapped_Authorized" })
        .in("id", [swapReq.requester_schedule_id, swapReq.target_schedule_id]);
    }

    // Update swap request status
    const { error: updateErr } = await supabase
      .from("tod_swap_requests")
      .update({ status: action_taken })
      .eq("id", swap_request_id);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ success: true, action: action_taken }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
