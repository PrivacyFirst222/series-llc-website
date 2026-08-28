import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";

const SITE = "MyFloridaSeriesLLC.com";

/** Browser-tab titles, named the way a visitor thinks of the page. Every page
 *  previously shared one title, which broke bookmarks, browser history, and
 *  screen-reader page announcements. The home page keeps the full pitch. */
const PAGE_TITLES: Record<string, string> = {
  "/": `${SITE} \u2014 Form a Florida Protected Series LLC`,
  "/what-is": `What Is a Protected Series LLC? \u2014 ${SITE}`,
  "/benefits": `Benefits \u2014 ${SITE}`,
  "/the-statute": `The Florida Statute \u2014 ${SITE}`,
  "/how-it-works": `How It Works \u2014 ${SITE}`,
  "/pricing": `Pricing \u2014 ${SITE}`,
  "/faq": `FAQ \u2014 ${SITE}`,
  "/asset-protection": `Asset Protection \u2014 ${SITE}`,
  "/recordkeeping-app": `Recordkeeping App \u2014 ${SITE}`,
  "/contact": `Contact \u2014 ${SITE}`,
  "/terms": `Terms of Service \u2014 ${SITE}`,
  "/privacy": `Privacy Policy \u2014 ${SITE}`,
  "/form-llc": `Form Your LLC \u2014 ${SITE}`,
  "/order/confirmed": `Order Confirmed \u2014 ${SITE}`,
  "/portal": `Client Portal \u2014 ${SITE}`,
  "/portal/agreement": `Operating Agreement Questionnaire \u2014 ${SITE}`,
  "/portal/login": `Client Sign-In \u2014 ${SITE}`,
  "/portal/forgot": `Forgot Password \u2014 ${SITE}`,
  "/portal/set-password": `Set Your Password \u2014 ${SITE}`,
  "/portal/verify-email": `Verify Your Email \u2014 ${SITE}`,
  "/admin": `Admin \u2014 ${SITE}`,
  "/admin/login": `Admin Sign-In \u2014 ${SITE}`,
};

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    document.title = PAGE_TITLES[pathname] ?? `Page Not Found \u2014 ${SITE}`;
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
