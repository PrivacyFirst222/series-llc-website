import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import Home from "./pages/Home";
import WhatIs from "./pages/WhatIs";
import Benefits from "./pages/Benefits";
import FloridaAdvantages from "./pages/FloridaAdvantages";
import HowItWorks from "./pages/HowItWorks";
import Pricing from "./pages/Pricing";
import Comparison from "./pages/Comparison";
import FAQ from "./pages/FAQ";
import AssetProtection from "./pages/AssetProtection";
import RecordkeepingApp from "./pages/RecordkeepingApp";
import Contact from "./pages/Contact";
import FormLLC from "./pages/FormLLC";
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
            <Route path="/florida-advantages" element={<FloridaAdvantages />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/comparison" element={<Comparison />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/asset-protection" element={<AssetProtection />} />
            <Route path="/recordkeeping-app" element={<RecordkeepingApp />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/form-llc" element={<FormLLC />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
