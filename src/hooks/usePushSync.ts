import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { currentSubscription, currentTimeZone, getPushStatus, registerSubscription } from "../lib/push";
import { expectRows, reportError } from "../lib/monitoring";

export function usePushSync() {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const timezone = currentTimeZone();
        const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
        if (!cancelled && profile && profile.timezone !== timezone) {
          const { data, error } = await supabase
            .from("profiles")
            .update({ timezone })
            .eq("user_id", userId)
            .select("user_id");
          if (error) throw error;
          expectRows("profiles.timezone", data);
        }

        // The browser still holds a subscription: make sure the server has it under this account.
        if (!cancelled && (await getPushStatus()) === "on") {
          const subscription = await currentSubscription();
          if (subscription) await registerSubscription(subscription);
        }
      } catch (error) {
        reportError(error, { area: "push", target: "sync" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
}
