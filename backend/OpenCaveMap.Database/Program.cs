using OpenCaveMap.Database;

if (args.Length == 0)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine("Usage: OpenCaveMap.Database [--check-connection] <connection-string>");
    Console.ResetColor();
    return -1;
}

try
{
    // Only reports whether this machine can connect, without running the migrations.
    if (args is ["--check-connection", var connectionString])
    {
        return ConnectionCheck.Run(connectionString);
    }

    DbUpRunner.Run(args[0]);
    return 0;
}
catch (Exception ex)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine(ex);
    Console.ResetColor();
    return -1;
}
