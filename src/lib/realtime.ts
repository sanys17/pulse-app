import { supabase } from "./supabase";

let channelCounter = 0;

// Calls onChange (debounced) whenever any of the tables changes, and once more
// after a dropped connection comes back, so missed events are never lost.
// Tables must be in the supabase_realtime publication (see migrations 006, 007).
export function subscribeToTables(tables: string[], onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 250);
  };

  const channel = supabase.channel(`rt:${tables.join(",")}:${++channelCounter}`);
  for (const table of tables) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, trigger);
  }

  let subscribedBefore = false;
  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    if (subscribedBefore) trigger();
    subscribedBefore = true;
  });

  return () => {
    clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
