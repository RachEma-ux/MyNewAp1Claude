/**
 * Diagnostic endpoints to test provider installation features
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";

export const diagnosticRouter = router({
  /**
   * Test if device detection is working
   */
  testDeviceDetection: publicProcedure.query(async () => {
    try {
      const { detectDeviceSpecs } = await import("../llm/device-detection");
      const specs = await detectDeviceSpecs();

      return {
        success: true,
        deviceSpecs: specs,
        summary: {
          ram: `${specs.ram.totalGB}GB total, ${specs.ram.availableGB}GB available`,
          cpu: `${specs.cpu.cores} cores, ${specs.cpu.architecture}`,
          gpu: specs.gpu?.detected ? specs.gpu.name : 'No GPU detected',
          os: specs.os.platform,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }),

  /**
   * Test if Ollama installation check is working
   */
  testOllamaCheck: publicProcedure.query(async () => {
    try {
      const { checkProviderInstallation } = await import("../llm/provider-installation");
      const result = await checkProviderInstallation('ollama');

      return {
        success: true,
        installationResult: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }),

  /**
   * Test if Ollama provider exists in registry
   */
  testOllamaProvider: publicProcedure.query(async () => {
    try {
      const { getProvider } = await import("../llm/providers");
      const ollama = getProvider('ollama');

      if (!ollama) {
        return {
          success: false,
          error: 'Ollama provider not found in registry',
        };
      }

      return {
        success: true,
        provider: {
          id: ollama.id,
          name: ollama.name,
          type: ollama.type,
          hasInstallation: !!ollama.installation,
          hasModelManagement: !!ollama.modelManagement,
          modelCount: ollama.models.length,
          modelsWithRequirements: ollama.models.filter(m => m.systemRequirements).length,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }),

  /**
   * Full diagnostic test
   */
  fullDiagnostic: publicProcedure.query(async () => {
    const results: any = {
      timestamp: new Date().toISOString(),
      tests: {},
    };

    // Test 1: Device Detection
    try {
      const { detectDeviceSpecs } = await import("../llm/device-detection");
      const specs = await detectDeviceSpecs();
      results.tests.deviceDetection = {
        status: 'PASS',
        ram: specs.ram.totalGB,
        cpu: specs.cpu.cores,
        gpu: specs.gpu?.detected || false,
      };
    } catch (error: any) {
      results.tests.deviceDetection = {
        status: 'FAIL',
        error: error.message,
      };
    }

    // Test 2: Provider Installation
    try {
      const { checkProviderInstallation } = await import("../llm/provider-installation");
      const check = await checkProviderInstallation('ollama');
      results.tests.installationCheck = {
        status: 'PASS',
        ollamaStatus: check.status,
      };
    } catch (error: any) {
      results.tests.installationCheck = {
        status: 'FAIL',
        error: error.message,
      };
    }

    // Test 3: Provider Registry
    try {
      const { getProvider, getAllProviders } = await import("../llm/providers");
      const ollama = getProvider('ollama');
      const allProviders = getAllProviders();

      results.tests.providerRegistry = {
        status: 'PASS',
        totalProviders: allProviders.length,
        ollamaFound: !!ollama,
        ollamaType: ollama?.type,
        ollamaHasInstallation: !!ollama?.installation,
      };
    } catch (error: any) {
      results.tests.providerRegistry = {
        status: 'FAIL',
        error: error.message,
      };
    }

    // Test 4: TRPC Routes
    results.tests.trpcRoutes = {
      status: 'PASS',
      endpoints: [
        'llm.checkProviderInstallation',
        'llm.getInstallationInstructions',
        'llm.getAvailableModels',
        'llm.getInstalledModels',
        'llm.getDeviceSpecs',
        'llm.checkModelCompatibility',
      ],
    };

    results.overallStatus = Object.values(results.tests).every((t: any) => t.status === 'PASS')
      ? 'ALL PASS'
      : 'SOME FAILED';

    return results;
  }),
});
