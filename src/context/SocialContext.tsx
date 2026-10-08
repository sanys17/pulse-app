import { createContext, useContext } from "react";
import { useUsername } from "../hooks/useUsername";
import { useFriendships } from "../hooks/useFriendships";
import { useActivityFeed } from "../hooks/useActivityFeed";
import { useSharedPlans } from "../hooks/useSharedPlans";

interface SocialContextValue {
  username: ReturnType<typeof useUsername>;
  friendships: ReturnType<typeof useFriendships>;
  feed: ReturnType<typeof useActivityFeed>;
  plans: ReturnType<typeof useSharedPlans>;
}

const SocialContext = createContext<SocialContextValue | null>(null);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const username = useUsername();
  const friendships = useFriendships();
  const feed = useActivityFeed();
  const plans = useSharedPlans();

  return (
    <SocialContext.Provider value={{ username, friendships, feed, plans }}>
      {children}
    </SocialContext.Provider>
  );
}

export function useSocial(): SocialContextValue {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocial must be used within SocialProvider");
  return ctx;
}
