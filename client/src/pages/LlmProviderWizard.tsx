import { useState } from 'react';
import { useNavigate } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

interface WizardState {
  // Step 1: Provider
  providerId: string;

  // Step 2: Model
  modelId: string;

  // Step 3: Runtime
  runtime: 'local' | 'cloud';

  // Step 4: Authentication
  apiKey?: string;

  // Step 5: Runtime Config
  temperature: number;
  maxTokens: number;
  streaming: boolean;

  // Meta
  name: string;
  description?: string;
}

export default function LlmProviderWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [wizardState, setWizardState] = useState<WizardState>({
    providerId: '',
    modelId: '',
    runtime: 'cloud',
    temperature: 0.7,
    maxTokens: 2048,
    streaming: true,
    name: '',
  });

  // Queries
  const { data: providers = [] } = useQuery({
    queryKey: ['/api/llm/listProviders'],
    queryFn: () => trpc.llm.listProviders.query(),
  });

  const { data: models = [] } = useQuery({
    queryKey: ['/api/llm/getProviderModels', wizardState.providerId],
    queryFn: () => trpc.llm.getProviderModels.query({ providerId: wizardState.providerId }),
    enabled: !!wizardState.providerId,
  });

  const selectedProvider = providers.find(p => p.id === wizardState.providerId);
  const selectedModel = models.find(m => m.id === wizardState.modelId);

  // Create mutation
  const createLlm = useMutation({
    mutationFn: async () => {
      const config = {
        provider: wizardState.providerId,
        model: wizardState.modelId,
        runtime: {
          type: wizardState.runtime,
          temperature: wizardState.temperature,
          maxTokens: wizardState.maxTokens,
          streaming: wizardState.streaming,
        },
        authentication: wizardState.apiKey ? { apiKey: wizardState.apiKey } : undefined,
      };

      return trpc.llm.create.mutate({
        name: wizardState.name,
        description: wizardState.description,
        runtime: wizardState.runtime,
        provider: wizardState.providerId,
        config,
        changeNotes: 'Created via Provider Wizard',
      });
    },
    onSuccess: () => {
      toast.success('LLM provider configured successfully');
      navigate('/llm');
    },
    onError: (error) => {
      toast.error('Failed to create LLM: ' + error.message);
    },
  });

  const updateState = (updates: Partial<WizardState>) => {
    setWizardState(prev => ({ ...prev, ...updates }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return !!wizardState.providerId;
      case 2:
        return !!wizardState.modelId;
      case 3:
        return !!wizardState.runtime;
      case 4:
        return !selectedProvider?.requiresApiKey || !!wizardState.apiKey;
      case 5:
        return true;
      case 6:
        return !!wizardState.name;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 6) {
      setCurrentStep((currentStep + 1) as WizardStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as WizardStep);
    }
  };

  const handleFinish = () => {
    createLlm.mutate();
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-8 w-8" />
          LLM Provider Wizard
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure a new LLM provider in {6} easy steps
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-semibold
                  ${step < currentStep ? 'bg-primary text-primary-foreground' : ''}
                  ${step === currentStep ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : ''}
                  ${step > currentStep ? 'bg-muted text-muted-foreground' : ''}
                `}
              >
                {step < currentStep ? <Check className="h-5 w-5" /> : step}
              </div>
              {step < 6 && (
                <div
                  className={`h-1 w-12 mx-2 ${
                    step < currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>Provider</span>
          <span>Model</span>
          <span>Runtime</span>
          <span>Auth</span>
          <span>Config</span>
          <span>Review</span>
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>
            {currentStep === 1 && 'Select Provider'}
            {currentStep === 2 && 'Select Model'}
            {currentStep === 3 && 'Choose Runtime'}
            {currentStep === 4 && 'Authentication'}
            {currentStep === 5 && 'Runtime Configuration'}
            {currentStep === 6 && 'Review & Create'}
          </CardTitle>
          <CardDescription>
            {currentStep === 1 && 'Choose from 14 LLM providers'}
            {currentStep === 2 && 'Select the specific model to use'}
            {currentStep === 3 && 'Configure where the model will run'}
            {currentStep === 4 && 'Set up authentication credentials'}
            {currentStep === 5 && 'Fine-tune runtime parameters'}
            {currentStep === 6 && 'Review your configuration and create'}
          </CardDescription>
        </CardHeader>

        <CardContent className="min-h-[400px]">
          {/* Step 1: Provider Selection */}
          {currentStep === 1 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => updateState({ providerId: provider.id })}
                  className={`
                    p-4 rounded-lg border-2 transition-all text-left
                    ${wizardState.providerId === provider.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                    }
                  `}
                >
                  <div className={`w-12 h-12 rounded-lg ${provider.color} mb-3 flex items-center justify-center text-white font-bold`}>
                    {provider.name.substring(0, 2).toUpperCase()}
                  </div>
                  <h3 className="font-semibold">{provider.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{provider.company}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {provider.strengths.slice(0, 2).map((strength) => (
                      <Badge key={strength} variant="secondary" className="text-xs">
                        {strength}
                      </Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Model Selection */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <RadioGroup
                value={wizardState.modelId}
                onValueChange={(value) => updateState({ modelId: value })}
              >
                {models.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center space-x-3 border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                  >
                    <RadioGroupItem value={model.id} id={model.id} />
                    <Label htmlFor={model.id} className="flex-1 cursor-pointer">
                      <div className="font-semibold">{model.name}</div>
                      {model.contextLength && (
                        <div className="text-sm text-muted-foreground">
                          Context: {model.contextLength.toLocaleString()} tokens
                        </div>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Step 3: Runtime */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <RadioGroup
                value={wizardState.runtime}
                onValueChange={(value: 'local' | 'cloud') => updateState({ runtime: value })}
              >
                <div className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="cloud" id="cloud" />
                    <Label htmlFor="cloud" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Cloud</div>
                      <div className="text-sm text-muted-foreground">
                        Run on cloud infrastructure with API endpoints
                      </div>
                    </Label>
                  </div>
                </div>

                <div className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="local" id="local" />
                    <Label htmlFor="local" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Local</div>
                      <div className="text-sm text-muted-foreground">
                        Run locally on your own hardware (Ollama, etc.)
                      </div>
                    </Label>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Step 4: Authentication */}
          {currentStep === 4 && (
            <div className="space-y-4">
              {selectedProvider?.requiresApiKey ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="Enter your API key"
                      value={wizardState.apiKey || ''}
                      onChange={(e) => updateState({ apiKey: e.target.value })}
                    />
                    <p className="text-sm text-muted-foreground">
                      This will be stored securely and used to authenticate with {selectedProvider.name}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Check className="h-16 w-16 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No authentication required</h3>
                  <p className="text-muted-foreground mt-2">
                    {selectedProvider?.name} doesn't require API credentials for this configuration
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Runtime Config */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Temperature</Label>
                    <span className="text-sm text-muted-foreground">{wizardState.temperature}</span>
                  </div>
                  <Slider
                    value={[wizardState.temperature]}
                    onValueChange={(value) => updateState({ temperature: value[0] })}
                    min={0}
                    max={2}
                    step={0.1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Lower = more focused, Higher = more creative
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Max Tokens</Label>
                    <span className="text-sm text-muted-foreground">{wizardState.maxTokens}</span>
                  </div>
                  <Slider
                    value={[wizardState.maxTokens]}
                    onValueChange={(value) => updateState({ maxTokens: value[0] })}
                    min={256}
                    max={8192}
                    step={256}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum length of generated responses
                  </p>
                </div>

                <div className="flex items-center justify-between border rounded-lg p-4">
                  <div>
                    <Label>Enable Streaming</Label>
                    <p className="text-sm text-muted-foreground">
                      Stream responses token by token
                    </p>
                  </div>
                  <Switch
                    checked={wizardState.streaming}
                    onCheckedChange={(checked) => updateState({ streaming: checked })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Review */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Configuration Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Production GPT-4"
                    value={wizardState.name}
                    onChange={(e) => updateState({ name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Input
                    id="description"
                    placeholder="What will this LLM be used for?"
                    value={wizardState.description || ''}
                    onChange={(e) => updateState({ description: e.target.value })}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold">Configuration Summary</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Provider</p>
                    <p className="font-medium">{selectedProvider?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Model</p>
                    <p className="font-medium">{selectedModel?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Runtime</p>
                    <p className="font-medium capitalize">{wizardState.runtime}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Authentication</p>
                    <p className="font-medium">
                      {wizardState.apiKey ? 'API Key Configured' : 'Not Required'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Temperature</p>
                    <p className="font-medium">{wizardState.temperature}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Max Tokens</p>
                    <p className="font-medium">{wizardState.maxTokens}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => navigate('/llm')}
            >
              Cancel
            </Button>

            {currentStep < 6 ? (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleFinish}
                disabled={!canProceed() || createLlm.isPending}
              >
                {createLlm.isPending ? 'Creating...' : 'Create LLM'}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
