CREATE TABLE "dca_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"pair" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"daily_amount" numeric(20, 2) NOT NULL,
	"minutes_interval" integer DEFAULT 1440 NOT NULL,
	"strategy" varchar(20) DEFAULT 'FIXED' NOT NULL,
	"last_executed" timestamp with time zone,
	"next_execution" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"pair" varchar(20) NOT NULL,
	"side" varchar(10) NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"entry_price" numeric(20, 8) NOT NULL,
	"current_stop_loss" numeric(20, 8),
	"original_stop_loss" numeric(20, 8),
	"take_profit1" numeric(20, 8),
	"take_profit2" numeric(20, 8),
	"take_profit3" numeric(20, 8),
	"tps_hit" integer[] DEFAULT '{}' NOT NULL,
	"highest_price" numeric(20, 8),
	"fees" numeric(20, 8) DEFAULT '0' NOT NULL,
	"strategy_id" uuid,
	"is_paper" boolean DEFAULT true NOT NULL,
	"status" varchar(30) DEFAULT 'OPEN' NOT NULL,
	"pnl_idr" numeric(20, 8),
	"pnl_percent" numeric(10, 4),
	"exit_price" numeric(20, 8),
	"exit_reason" varchar(50),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"hold_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period" varchar(10) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"trades_count" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"total_pnl" numeric(20, 8) DEFAULT '0' NOT NULL,
	"total_fees" numeric(20, 8) DEFAULT '0' NOT NULL,
	"win_rate" numeric(6, 4),
	"largest_win" numeric(20, 8),
	"largest_loss" numeric(20, 8),
	"avg_hold_minutes" numeric(10, 2)
);
--> statement-breakpoint
ALTER TABLE "dca_configs" ADD CONSTRAINT "dca_configs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_stats" ADD CONSTRAINT "trading_stats_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dca_account_active_idx" ON "dca_configs" USING btree ("account_id","is_active");--> statement-breakpoint
CREATE INDEX "positions_account_status_idx" ON "positions" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "positions_pair_status_idx" ON "positions" USING btree ("pair","status");--> statement-breakpoint
CREATE INDEX "stats_account_period_idx" ON "trading_stats" USING btree ("account_id","period","period_start");