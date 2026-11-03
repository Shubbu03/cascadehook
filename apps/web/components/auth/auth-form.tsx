
import { buttonStyles } from "@/components/button";
import { auth } from "@clerk/nextjs/server";
import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isAuthConfigured } from "@/lib/server/auth";
import { LoginForm } from "./login-form";

export async function AuthForm() {
  await connection();
  if (!isAuthConfigured()) {
    return (
      <div data-ui="empty-state" className="grid justify-items-start rounded-xl bg-surface gap-3.5 p-7 border border-solid border-border [&_h3]:text-[20px] [&_h3]:tracking-[-0.02em] [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7] in-data-[ui~='dashboard-main']:flex in-data-[ui~='dashboard-main']:flex-col in-data-[ui~='dashboard-main']:items-center in-data-[ui~='dashboard-main']:justify-center in-data-[ui~='dashboard-main']:min-h-55 in-data-[ui~='dashboard-main']:bg-transparent in-data-[ui~='dashboard-main']:text-center in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:py-8 in-data-[ui~='dashboard-main']:px-6 in-data-[ui~='dashboard-main']:border-dashed [[data-ui~='dashboard-main']_&_h2]:text-[17px] [[data-ui~='dashboard-main']_&_h2]:m-0 [[data-ui~='dashboard-main']_&_h3]:text-[17px] [[data-ui~='dashboard-main']_&_h3]:m-0 [[data-ui~='dashboard-main']_&_p]:max-w-120 [[data-ui~='dashboard-main']_&_p]:text-[13px] [[data-ui~='dashboard-main']_&_p]:leading-[1.7] [[data-ui~='dashboard-main']_&_p]:m-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:min-h-50 max-[37.5rem]:in-data-[ui~='dashboard-main']:px-4.5">
        <LockKeyIcon size={28} className="text-accent" aria-hidden="true" />
        <h3>Account access unavailable</h3>
        <p>Please try again later.</p>
        <Link href="/" data-ui="button" className={buttonStyles({ variant: "secondary" })}>
          Back to Cascadehook
        </Link>
      </div>
    );
  }
  const { userId } = await auth();
  if (userId) redirect("/dashboard");
  return <LoginForm />;
}
