import type { Metadata } from 'next';

export const metadata: Metadata = { title: { absolute: 'Payment · LocalLoop' }, robots: { index: false } };

/**
 * Where Razorpay sends the customer's browser after paying. It only shows a
 * message and a button back into the app; the order is confirmed separately
 * by Razorpay's signed webhook, never by this page.
 */
export default async function PaymentReturn({ searchParams }: { searchParams: Promise<{ order?: string; razorpay_payment_link_status?: string }> }) {
  const sp = await searchParams;
  const order = sp.order && /^[0-9a-f-]{36}$/.test(sp.order) ? sp.order : null;
  const paid = sp.razorpay_payment_link_status === 'paid';
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 p-8 text-center">
      <p className="text-xl font-bold text-forest">LocalLoop</p>
      <h1 className="text-2xl font-bold">{paid ? 'Payment received' : 'Payment not completed'}</h1>
      <p className="text-ink-2">
        {paid
          ? 'Thank you! Your order has been sent to the shop. Go back to the app to follow it.'
          : 'No money was taken. Go back to the app to try again or choose cash on delivery.'}
        <br />
        <span lang="te">{paid ? 'ధన్యవాదాలు! మీ ఆర్డర్ దుకాణానికి పంపబడింది.' : 'డబ్బు తీసుకోలేదు. యాప్‌కి తిరిగి వెళ్లండి.'}</span>
      </p>
      <a
        href={order ? `localloop://order/${order}` : 'localloop://'}
        className="inline-flex h-12 items-center rounded-lg bg-forest px-6 font-medium text-white hover:bg-green"
      >
        Open LocalLoop
      </a>
    </main>
  );
}
