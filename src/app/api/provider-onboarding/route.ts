import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getProviderOnboardingState,
  getActiveConnectionForProvider,
  getBusinessCriteriaWithFields,
  completeProviderOnboarding,
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

  switch (action) {
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
