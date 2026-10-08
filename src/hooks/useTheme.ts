import { useEffect } from "react";

export function useTheme() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", "#07070C");
  }, []);
}
