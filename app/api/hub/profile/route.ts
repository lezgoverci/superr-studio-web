import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MEMBER_AI_FAMILIARITY,
  MEMBER_CAREER_PRESSURE,
  MEMBER_SKILL_LEVELS,
} from "@/lib/hub/types";
import { getHubMemberProfile, updateMemberProfile } from "@/lib/hub/member-profiles";
import {
  getAuthenticatedHubUser,
  unauthorizedHubResponse,
} from "@/lib/hub/request";

const ProfilePatchSchema = z.object({
  displayName: z.string().max(120).nullable().optional(),
  bio: z.string().max(600).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  avatarUrl: z.string().max(2048).nullable().optional(),
  isPublic: z.boolean().optional(),
  currentRole: z.string().max(120).nullable().optional(),
  targetRole: z.string().max(120).nullable().optional(),
  skillLevel: z.enum(MEMBER_SKILL_LEVELS).nullable().optional(),
  aiFamiliarity: z.enum(MEMBER_AI_FAMILIARITY).nullable().optional(),
  careerPressure: z.enum(MEMBER_CAREER_PRESSURE).nullable().optional(),
  firstGoal: z.string().max(400).nullable().optional(),
  completeOnboarding: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const profile = await getHubMemberProfile(user.id, {
      name: user.name ?? null,
      image: user.image ?? null,
    });

    return NextResponse.json(profile);
  } catch (error) {
    console.error("[hub/profile] Failed to load member profile:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load member profile",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const rawBody = await request.json();
    const parsed = ProfilePatchSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid profile payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const profile = await updateMemberProfile(user.id, {
      displayName: body.displayName,
      bio: body.bio,
      location: body.location,
      avatarUrl: body.avatarUrl,
      isPublic: body.isPublic,
      currentRole: body.currentRole,
      targetRole: body.targetRole,
      skillLevel: body.skillLevel,
      aiFamiliarity: body.aiFamiliarity,
      careerPressure: body.careerPressure,
      firstGoal: body.firstGoal,
      onboardingCompletedAt:
        body.completeOnboarding === undefined
          ? undefined
          : body.completeOnboarding
            ? new Date()
            : null,
    });

    return NextResponse.json(profile);
  } catch (error) {
    console.error("[hub/profile] Failed to update member profile:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update member profile",
      },
      { status: 500 }
    );
  }
}
