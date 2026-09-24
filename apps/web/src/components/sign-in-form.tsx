import { Button } from "@hourino/ui/components/button";
import { Input } from "@hourino/ui/components/input";
import { Label } from "@hourino/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import { GoogleSignInButton } from "./google-sign-in-button";
import Loader from "./loader";

export default function SignInForm() {
	const navigate = useNavigate({
		from: "/",
	});
	const { isPending } = authClient.useSession();

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signIn.email(
				{
					email: value.email,
					password: value.password,
				},
				{
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
					onSuccess: () => {
						navigate({
							to: "/calendar",
						});
						toast.success("Sign in successful");
					},
				}
			);
		},
		validators: {
			onSubmit: z.object({
				email: z.email("Invalid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	if (isPending) {
		return <Loader />;
	}

	return (
		<div className="grain mx-auto mt-10 w-full max-w-md p-6">
			<h1 className="mb-6 text-center font-bold text-3xl">Welcome Back</h1>

			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<div>
					<form.Field name="email">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Email</Label>
								<Input
									id={field.name}
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									type="email"
									value={field.state.value}
								/>
								{field.state.meta.errors.map((error) => (
									<p className="text-destructive" key={error?.message}>
										{error?.message}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<div>
					<form.Field name="password">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Password</Label>
								<Input
									id={field.name}
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									type="password"
									value={field.state.value}
								/>
								{field.state.meta.errors.map((error) => (
									<p className="text-destructive" key={error?.message}>
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
							{isSubmitting ? "Submitting..." : "Sign In"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<div className="mt-4">
				<GoogleSignInButton />
			</div>

			<div className="mt-4 space-y-2 text-center">
				<p>
					<Link
						className="text-primary underline-offset-4 hover:text-primary/80 hover:underline"
						to="/forgot-password"
					>
						Forgot your password?
					</Link>
				</p>
				<p>
					<Link
						className="text-primary underline-offset-4 hover:text-primary/80 hover:underline"
						to="/signup"
					>
						Need an account? Sign up
					</Link>
				</p>
			</div>
		</div>
	);
}
