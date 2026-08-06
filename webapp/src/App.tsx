import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import Home from "./pages/Home";
import WhatIs from "./pages/WhatIs";
import Benefits from "./pages/Benefits";
import TheStatute from "./pages/TheStatute";
import HowItWorks from "./pages/HowItWorks";
import Pricing from "./pages/Pricing";
import FAQ from "./pages/FAQ";
import AssetProtection from "./pages/AssetProtection";
import RecordkeepingApp from "./pages/RecordkeepingApp";
import Contact from "./pages/Contact";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import FormLLC from "./pages/FormLLC";
import OrderConfirmed from "./pages/OrderConfirmed";
import PortalLogin from "./pages/portal/PortalLogin";
import PortalForgot from "./pages/portal/PortalForgot";
import PortalSetPassword from "./pages/portal/PortalSetPassword";
import PortalDashboard from "./pages/portal/PortalDashboard";
import OAQuestionnaire from "./pages/portal/OAQuestionnaire";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/what-is" element={<WhatIs />} />
            <Route path="/benefits" element={<Benefits />} />
            <Route path="/the-statute" element={<TheStatute />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/asset-protection" element={<AssetProtection />} />
            <Route path="/recordkeeping-app" element={<RecordkeepingApp />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/form-llc" element={<FormLLC />} />
            <Route path="/order/confirmed" element={<OrderConfirmed />} />
            <Route path="/portal" element={<PortalDashboard />} />
            <Route path="/portal/agreement" element={<OAQuestionnaire />} />
            <Route path="/portal/login" element={<PortalLogin />} />
            <Route path="/portal/forgot" element={<PortalForgot />} />
            <Route path="/portal/set-password" element={<PortalSetPassword />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
