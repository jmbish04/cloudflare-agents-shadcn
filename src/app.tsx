import { Suspense, useCallback, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, getToolName } from "ai";
import type { UIMessage, ToolUIPart, DynamicToolUIPart } from "ai";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Streamdown } from "streamdown";
import { Toaster } from "sonner";
import { toast } from "sonner";
import {
  Trash2Icon,
  Settings2Icon,
  MessageSquareDotIcon,
  CircleIcon,
  BugIcon
} from "lucide-react";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolOutput
} from "@/components/ai-elements/tool";

function toolHeaderProps(part: UIMessage["parts"][number], title: string) {
  if (part.type === "dynamic-tool") {
    return {
      type: "dynamic-tool" as DynamicToolUIPart["type"],
      state: (part as DynamicToolUIPart).state,
      toolName: title,
      title
    };
  }
  return {
    type: part.type as ToolUIPart["type"],
    state: (part as ToolUIPart).state,
    title
  };
}
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationActions,
  ConfirmationAction
} from "@/components/ai-elements/confirmation";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent
} from "@/components/ai-elements/reasoning";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState
} from "@/components/ai-elements/conversation";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit
} from "@/components/ai-elements/prompt-input";

// ── Tool rendering ────────────────────────────────────────────────────

const PROMPTS = [
  "What's the weather in Paris?",
  "What timezone am I in?",
  "Calculate 5000 * 3",
  "Remind me in 5 minutes to take a break"
];

function ToolPartView({
  part,
  addToolApprovalResponse
}: {
  part: UIMessage["parts"][number];
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
}) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);
  const approval = "approval" in part
    ? (part.approval as { id?: string; approved?: boolean } | undefined)
    : undefined;
  const approvalId = approval?.id;

  // Needs approval
  if (part.state === "approval-requested") {
    return (
      <div className="flex justify-start">
        <Confirmation
          className="max-w-[85%]"
          approval={approval as Parameters<typeof Confirmation>[0]["approval"]}
          state={part.state}
        >
          <ConfirmationTitle>
            <span className="flex items-center gap-2">
              <Settings2Icon className="size-3.5 text-yellow-600 dark:text-yellow-400" />
              <span className="font-medium">Approval needed: {toolName}</span>
            </span>
          </ConfirmationTitle>
          <ConfirmationRequest>
            <div className="font-mono text-xs text-muted-foreground">
              {JSON.stringify(part.input, null, 2)}
            </div>
          </ConfirmationRequest>
          <ConfirmationActions>
            <ConfirmationAction
              variant="default"
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: true });
                }
              }}
            >
              Approve
            </ConfirmationAction>
            <ConfirmationAction
              variant="secondary"
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: false });
                }
              }}
            >
              Reject
            </ConfirmationAction>
          </ConfirmationActions>
        </Confirmation>
      </div>
    );
  }

  // Completed
  if (part.state === "output-available") {
    return (
      <div className="flex justify-start max-w-[85%]">
        <Tool className="w-full">
          <ToolHeader {...toolHeaderProps(part, toolName)} />
          <ToolContent>
            <ToolOutput output={part.output} errorText={part.errorText} />
          </ToolContent>
        </Tool>
      </div>
    );
  }

  // Rejected / denied
  if (part.state === "output-denied") {
    return (
      <div className="flex justify-start max-w-[85%]">
        <Tool className="w-full">
          <ToolHeader {...toolHeaderProps(part, toolName)} />
        </Tool>
      </div>
    );
  }

  // Executing
  if (part.state === "input-available" || part.state === "input-streaming") {
    return (
      <div className="flex justify-start max-w-[85%]">
        <Tool className="w-full">
          <ToolHeader {...toolHeaderProps(part, toolName)} />
        </Tool>
      </div>
    );
  }

  return null;
}

// ── Main chat ─────────────────────────────────────────────────────────

function Chat() {
  const [connected, setConnected] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const agent = useAgent({
    agent: "ChatAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    ),
    onMessage: useCallback(
      (message: MessageEvent) => {
        try {
          const data = JSON.parse(String(message.data));
          if (data.type === "scheduled-task") {
            toast("Scheduled task completed", { description: data.description });
          }
        } catch {
          // Not JSON or not our event
        }
      },
      []
    )
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status
  } = useAgentChat({
    agent,
    onToolCall: async (event) => {
      if (
        "addToolOutput" in event &&
        event.toolCall.toolName === "getUserTimezone"
      ) {
        event.addToolOutput({
          toolCallId: event.toolCall.toolCallId,
          output: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            localTime: new Date().toLocaleTimeString()
          }
        });
      }
    }
  });

  const isStreaming = status === "streaming" || status === "submitted";

  // Re-focus happens automatically via PromptInputTextarea

  return (
    <div className="flex flex-col h-screen bg-muted/50">
      {/* Header */}
      <header className="px-5 py-4 bg-background border-b border-border">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">
              <span className="mr-2">⛅</span>Agent Starter
            </h1>
            <Badge variant="secondary">
              <MessageSquareDotIcon className="size-3 mr-1" />
              AI Chat
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <CircleIcon
                className={`size-2 fill-current ${connected ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
              />
              <span className="text-xs text-muted-foreground">
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <BugIcon className="size-3.5 text-muted-foreground" />
              <Switch
                checked={showDebug}
                onCheckedChange={setShowDebug}
                aria-label="Toggle debug mode"
              />
            </div>
            <ModeToggle />
            <Button
              variant="secondary"
              onClick={clearHistory}
            >
              <Trash2Icon className="size-4 mr-1.5" />
              Clear
            </Button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <Conversation className="flex-1">
        <ConversationContent className="max-w-3xl mx-auto w-full px-5 py-6">
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={<MessageSquareDotIcon className="size-8" />}
              title="Start a conversation"
            >
              <Suggestions>
                {PROMPTS.map((prompt) => (
                  <Suggestion
                    key={prompt}
                    suggestion={prompt}
                    disabled={isStreaming}
                    onClick={(text) => {
                      sendMessage({
                        role: "user",
                        parts: [{ type: "text", text }]
                      });
                    }}
                  />
                ))}
              </Suggestions>
            </ConversationEmptyState>
          )}

          {messages.map((message: UIMessage, index: number) => {
            const isUser = message.role === "user";
            const isLastAssistant =
              message.role === "assistant" && index === messages.length - 1;

            return (
              <div key={message.id} className="space-y-2">
                {showDebug && (
                  <pre className="text-[11px] text-muted-foreground/60 bg-muted rounded-lg p-3 overflow-auto max-h-64">
                    {JSON.stringify(message, null, 2)}
                  </pre>
                )}

                {/* Tool parts */}
                {message.parts.filter(isToolUIPart).map((part) => (
                  <ToolPartView
                    key={part.toolCallId}
                    part={part}
                    addToolApprovalResponse={addToolApprovalResponse}
                  />
                ))}

                {/* Reasoning parts */}
                {message.parts
                  .filter(
                    (part) =>
                      part.type === "reasoning" &&
                      (part as { text?: string }).text?.trim()
                  )
                  .map((part, i) => {
                    const reasoning = part as {
                      type: "reasoning";
                      text: string;
                      state?: "streaming" | "done";
                    };
                    const isDone = reasoning.state === "done" || !isStreaming;
                    return (
                      <div key={i} className="flex justify-start">
                        <Reasoning isStreaming={!isDone} className="max-w-[85%] w-full">
                          <ReasoningTrigger />
                          <ReasoningContent>{reasoning.text}</ReasoningContent>
                        </Reasoning>
                      </div>
                    );
                  })}

                {/* Text parts */}
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part, i) => {
                    const text = (part as { type: "text"; text: string }).text;
                    if (!text) return null;

                    if (isUser) {
                      return (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-primary text-primary-foreground leading-relaxed">
                            {text}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={i} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-background text-foreground leading-relaxed">
                          <Streamdown
                            className="sd-theme rounded-2xl rounded-bl-md p-3"
                            controls={false}
                            isAnimating={isLastAssistant && isStreaming}
                          >
                            {text}
                          </Streamdown>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input */}
      <div className="border-t border-border bg-background">
        <div className="max-w-3xl mx-auto px-5 py-4">
          <PromptInput
            onSubmit={({ text }) => {
              if (!text.trim() || !connected || isStreaming) return;
              sendMessage({ role: "user", parts: [{ type: "text", text }] });
            }}
          >
            <PromptInputTextarea
              placeholder="Send a message..."
              disabled={!connected || isStreaming}
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <TooltipProvider>
      <Toaster />
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-muted-foreground">
            Loading...
          </div>
        }
      >
        <Chat />
      </Suspense>
      </TooltipProvider>
    </ThemeProvider>
  );
}
