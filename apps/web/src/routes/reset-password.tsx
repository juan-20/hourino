import { Button } from "@hourino/ui/components/button";
import { Input } from "@hourino/ui/components/input";
import { Label } from "@hourino/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
	component: RouteComponent,
	validateSearch: z.object({
		token: z.string(),
	}),
});

function RouteComponent() {
	const { token } = Route.useSearch();
	const navigate = useNavigate();

	const form = useForm({
		defaultValues: {
			password: "",
		},
		onSubmit: async ({ value }) => {
			const { error } = await authClient.resetPassword({
				newPassword: value.password,
				token,
			});

			if (error) {
				toast.error(error.message || "Failed to reset password");
				return;
			}

			toast.success("Password reset successful");
			navigate({
				to: "/login",
			});
		},
		validators: {
			onSubmit: z.object({
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	return (
		<div className="mx-auto mt-10 w-full max-w-md p-6">
			<h1 className="mb-6 text-center font-bold text-3xl">Reset Password</h1>

			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<div>
					<form.Field name="password">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>New password</Label>
								<Input
									id={field.name}
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									type="password"
									value={field.state.value}
								/>
								{field.state.meta.errors.map((error) => (
									<p className="text-red-500" key={error?.message}>
										{error?.message}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<form.Subscribe
					selector={(state) => ({
						canSubmit: state.canSubmit,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ canSubmit, isSubmitting }) => (
						<Button
							className="w-full"
							disabled={!canSubmit || isSubmitting}
							type="submit"
						>
							{isSubmitting ? "Resetting..." : "Reset password"}
						</Button>
					)}
				</form.Subscribe>
			</form>
		</div>
	);
}
