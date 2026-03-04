import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getProviderOnboardingState,
  getActiveConnectionForProvider,
  getBusinessCriteriaWithFields,
  createTermsAcceptance,
  createCriteriaAcknowledgment,
  updateProviderOnboardingStep,
  completeProviderOnboarding,
  updateUser,
  getUserById,
} from '@/lib/db';

// GET — provider auth, returns onboarding state
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'provider') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const state = await getProviderOnboardingState(session.user.id);
  if (!state) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }

  const connection = await getActiveConnectionForProvider(session.user.id);
  let criteria = null;
  let fields: unknown[] = [];

  if (connection) {
    const result = await getBusinessCriteriaWithFields(connection.buyer_id);
    if (result) {
      criteria = result.criteria;
      fields = result.fields;
    }
  }

  // Get fresh user data for step 3 profile check
  const user = await getUserById(session.user.id);

  return NextResponse.json({
    step: state.step,
    complete: state.complete,
    connection: connection ? {
      id: connection.id,
      buyerId: connection.buyer_id,
      ratePerLead: Number(connection.rate_per_lead),
      weeklyCap: connection.weekly_lead_cap,
      monthlyCap: connection.monthly_lead_cap,
    } : null,
    criteria,
    fields,
    profile: user ? {
      displayName: user.display_name,
      phone: user.phone,
      location: user.location,
      profilePictureUrl: user.profile_picture_url,
    } : null,
  });
}

// POST — provider auth, advance onboarding
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'provider') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  const state = await getProviderOnboardingState(session.user.id);
  if (!state) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }

  if (state.complete) {
    return NextResponse.json({ error: 'Onboarding already complete' }, { status: 400 });
  }

  const connection = await getActiveConnectionForProvider(session.user.id);

  switch (action) {
    case 'accept_terms': {
      if (state.step !== 1) {
        return NextResponse.json({ error: 'Invalid step for this action' }, { status: 400 });
      }
      if (!connection) {
        return NextResponse.json({ error: 'No active connection' }, { status: 400 });
      }
      const criteriaResult = await getBusinessCriteriaWithFields(connection.buyer_id);
      if (criteriaResult) {
        await createTermsAcceptance({
          provider_id: session.user.id,
          business_id: connection.buyer_id,
          criteria_id: criteriaResult.criteria.id,
        });
      }
      await updateProviderOnboardingStep(session.user.id, 2);
      return NextResponse.json({ step: 2 });
    }

    case 'acknowledge_criteria': {
      if (state.step !== 2) {
        return NextResponse.json({ error: 'Invalid step for this action' }, { status: 400 });
      }
      if (!connection) {
        return NextResponse.json({ error: 'No active connection' }, { status: 400 });
      }
      const criteriaResult = await getBusinessCriteriaWithFields(connection.buyer_id);
      if (criteriaResult) {
        await createCriteriaAcknowledgment({
          provider_id: session.user.id,
          business_id: connection.buyer_id,
          criteria_id: criteriaResult.criteria.id,
        });
      }
      await updateProviderOnboardingStep(session.user.id, 3);
      return NextResponse.json({ step: 3 });
    }

    case 'update_profile': {
      if (state.step !== 3) {
        return NextResponse.json({ error: 'Invalid step for this action' }, { status: 400 });
      }
      const { displayName, phone, location, profilePictureUrl } = body;
      if (!displayName || !phone || !location) {
        return NextResponse.json({ error: 'Display name, phone, and location are required' }, { status: 400 });
      }
      await updateUser(session.user.id, {
        display_name: displayName,
        phone,
        location,
        profile_picture_url: profilePictureUrl || undefined,
      } as Partial<import('@/lib/db').DbUser>);
      await updateProviderOnboardingStep(session.user.id, 4);
      return NextResponse.json({ step: 4 });
    }

    case 'complete_stripe': {
      if (state.step !== 4) {
        return NextResponse.json({ error: 'Invalid step for this action' }, { status: 400 });
      }
      // Verify Stripe onboarding is actually complete
      const user = await getUserById(session.user.id);
      if (!user?.stripe_onboarding_complete) {
        return NextResponse.json({ error: 'Stripe onboarding not complete' }, { status: 400 });
      }
      await completeProviderOnboarding(session.user.id);
      return NextResponse.json({ step: 4, complete: true });
    }

    case 'skip_stripe': {
      if (state.step !== 4) {
        return NextResponse.json({ error: 'Invalid step for this action' }, { status: 400 });
      }
      await completeProviderOnboarding(session.user.id);
      return NextResponse.json({ step: 4, complete: true });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
