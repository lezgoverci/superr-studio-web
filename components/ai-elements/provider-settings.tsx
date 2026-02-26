"use client";

import { useState, useEffect } from "react";
import { getOpenCodeClient } from "@/lib/opencode-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Save, Trash2, Key, Loader2, Link as LinkIcon, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ProviderSettingsTriggerVariant = "default" | "menu-item";

type ProviderSettingsProps = {
  className?: string;
  triggerVariant?: ProviderSettingsTriggerVariant;
  onTriggerClick?: () => void;
  /** When true, renders only the Dialog (no trigger button). */
  dialogOnly?: boolean;
  /** Controlled open state for the dialog. */
  externalOpen?: boolean;
  /** Callback when controlled open state changes. */
  onExternalOpenChange?: (open: boolean) => void;
};

export function ProviderSettings({
  className,
  triggerVariant = "default",
  onTriggerClick,
  dialogOnly = false,
  externalOpen,
  onExternalOpenChange,
}: ProviderSettingsProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onExternalOpenChange !== undefined ? onExternalOpenChange : setInternalOpen;
  const [providers, setProviders] = useState<any[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // State for API key inputs per provider
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

  const loadProviders = async () => {
    const client = getOpenCodeClient();
    if (!client) return;
    setLoading(true);
    try {
      const resp = await client.provider.list();
      setProviders(resp.data?.all || []);
      setConnected(resp.data?.connected || []);
    } catch (err: any) {
      toast.error("Failed to load providers: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadProviders();
    }
  }, [open]);

  const handleSaveApiKey = async (providerId: string) => {
    const key = apiKeys[providerId];
    if (!key) return;

    const client = getOpenCodeClient();
    if (!client) return;

    try {
      await client.auth.set({
        path: { id: providerId },
        body: { type: "api", key }
      });
      toast.success(`Connected ${providerId}`);
      setApiKeys((prev) => ({ ...prev, [providerId]: "" }));
      loadProviders();
    } catch (err: any) {
      toast.error("Failed to connect: " + err.message);
    }
  };

  const handleRemoveApiKey = async (providerId: string) => {
    const client = getOpenCodeClient();
    if (!client) return;

    try {
      await client.auth.set({
        path: { id: providerId },
        body: { type: "api", key: "" }
      });
      toast.success(`Disconnected ${providerId}`);
      loadProviders();
    } catch (err: any) {
      toast.error("Failed to disconnect: " + err.message);
    }
  };

  const handleOAuth = async (providerId: string) => {
    const client = getOpenCodeClient();
    if (!client) return;

    try {
      const resp = await client.provider.oauth.authorize({
        path: { id: providerId },
        body: { method: 0 }
      });
      // The local server should open the browser automatically or return a URL to open
      toast.info("Follow instructions in your browser to authenticate.");
      
      // Periodically check if connected
      const interval = setInterval(async () => {
        const check = await client.provider.list();
        if (check.data?.connected?.includes(providerId)) {
          clearInterval(interval);
          toast.success(`Connected ${providerId} via OAuth`);
          loadProviders();
        }
      }, 2000);
      
      // Stop checking after 2 minutes
      setTimeout(() => clearInterval(interval), 120000);
      
    } catch (err: any) {
      toast.error("OAuth failed: " + err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!dialogOnly && (
        <DialogTrigger asChild>
          {triggerVariant === "menu-item" ? (
            <button
              className={cn(
                "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none",
                className
              )}
              onClick={() => onTriggerClick?.()}
              type="button"
            >
              <Settings className="size-4" />
              <span className="flex-1 text-left">Provider Settings</span>
            </button>
          ) : (
            <Button
              className={cn("ml-2 h-8 w-8", className)}
              onClick={() => onTriggerClick?.()}
              size="icon"
              variant="ghost"
            >
              <Settings className="size-4" />
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>AI Provider Connections</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No providers available. Please check Agent server connection.
            </p>
          ) : (
            providers.map((p) => {
              const isConnected = connected.includes(p.id);
              // Simple heuristic to determine if OAuth or API key.
              // Anthropic/OpenAI usually need API keys. Gemini/Antigravity use OAuth.
              const isOAuth = p.id.includes("gemini") || p.id.includes("antigravity");
              
              return (
                <div key={p.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm capitalize">{p.name || p.id}</h3>
                    {isConnected ? (
                      <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-medium">
                        Connected
                      </span>
                    ) : (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                        Not Connected
                      </span>
                    )}
                  </div>
                  
                  {p.description && (
                     <p className="text-xs text-muted-foreground">{p.description}</p>
                  )}

                  {!isConnected && !isOAuth && (
                    <div className="flex gap-2 mt-2">
                      <div className="relative flex-1">
                        <Key className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                        <Input 
                          type="password" 
                          placeholder="API Key" 
                          className="pl-8 h-8 text-xs"
                          value={apiKeys[p.id] || ""}
                          onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        />
                      </div>
                      <Button size="sm" className="h-8" onClick={() => handleSaveApiKey(p.id)}>
                        <Save className="size-3.5 mr-1" /> Save
                      </Button>
                    </div>
                  )}

                  {!isConnected && isOAuth && (
                    <div className="mt-2">
                      <Button size="sm" variant="outline" className="w-full text-xs h-8" onClick={() => handleOAuth(p.id)}>
                        <LinkIcon className="size-3.5 mr-2" /> Connect Account
                      </Button>
                      {p.id.includes("antigravity") && (
                        <div className="flex items-start gap-1.5 mt-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 p-2 rounded text-[10px] leading-tight">
                          <AlertCircle className="size-3 shrink-0 mt-0.5" />
                          <p>Unofficial Google connection. Use a burner account to avoid ToS bans.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {isConnected && (
                    <div className="flex justify-end mt-2">
                      <Button size="sm" variant="ghost" className="text-destructive h-8 text-xs px-2" onClick={() => handleRemoveApiKey(p.id)}>
                        <Trash2 className="size-3.5 mr-1" /> Disconnect
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
