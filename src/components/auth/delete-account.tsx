"use client";

import { deleteMyAccount } from "@/app/auth-actions";
import { DeleteButton } from "@/components/confirm-dialog";

/** Profile: delete the account (asks first; blocked while refills are active). */
export function DeleteAccountButton() {
  return (
    <DeleteButton
      label="Delete my account"
      text="Delete my account"
      className="flex min-h-11 items-center gap-2 self-start rounded-[10px] border border-destructive/40 px-4 text-destructive hover:bg-destructive/10"
      title="Delete your LifeCart account?"
      confirmLabel="OK, delete everything"
      body={
        <>
          <span>This permanently deletes your plans, bills, price watches, payment history in LifeCart and your profile. It can&apos;t be undone.</span>
          <span>Payments themselves stay in your PayPal account. If you have active monthly refills, cancel them in Orders &amp; watch first.</span>
        </>
      }
      onConfirm={() => deleteMyAccount()}
    />
  );
}
