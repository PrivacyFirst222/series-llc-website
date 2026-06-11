import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <section className="container-tight py-32 lg:py-40 text-center">
      <span className="eyebrow">404</span>
      <h1 className="display mt-4 text-5xl text-balance lg:text-7xl">
        That page <em>drifted out to sea</em>.
      </h1>
      <p className="mt-5 max-w-lg mx-auto text-base text-muted-foreground">
        We couldn't find what you were looking for. The Florida Protected Series LLC, however, is
        right where you left it.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild className="rounded-full bg-primary text-primary-foreground">
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Back home
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/what-is">
            <ArrowLeft className="mr-2 h-4 w-4" />
            What is a Series LLC?
          </Link>
        </Button>
      </div>
    </section>
  );
}
