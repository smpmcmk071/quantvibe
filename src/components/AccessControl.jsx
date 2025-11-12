import React from 'react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AccessControl({ 
  hasAccess, 
  featureName, 
  requiredTier,
  children 
}) {
  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <Alert className="bg-gray-50 border-gray-200">
      <Lock className="h-4 w-4" />
      <AlertDescription className="ml-2">
        <div className="flex justify-between items-center">
          <span>
            <strong>{featureName}</strong> is only available on <strong>{requiredTier}</strong> tier.
          </span>
          <Button size="sm" variant="outline">
            Upgrade
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}