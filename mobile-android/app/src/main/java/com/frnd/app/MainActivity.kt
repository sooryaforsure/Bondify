package com.frnd.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.frnd.app.ui.screens.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FrndAppTheme {
                MainScreenContainer()
            }
        }
    }
}

@Composable
fun FrndAppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color(0xFF6366F1),
            secondary = Color(0xFFA855F7),
            tertiary = Color(0xFFEC4899),
            background = Color(0xFF030712),
            surface = Color(0xFF111827),
            onPrimary = Color.White,
            onBackground = Color(0xFFF9FAFB),
            onSurface = Color(0xFFE5E7EB)
        ),
        content = content
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreenContainer() {
    var selectedTab by remember { mutableStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row {
                        Text("FRND", style = MaterialTheme.typography.titleLarge, color = Color(0xFF818CF8))
                    }
                },
                actions = {
                    AssistChip(
                        onClick = { /* Wallet actions */ },
                        label = { Text("🪙 250 Coins") },
                        colors = AssistChipDefaults.assistChipColors(labelColor = Color(0xFFFBBF24))
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF111827))
            )
        },
        bottomBar = {
            NavigationBar(containerColor = Color(0xFF111827)) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Shuffle, contentDescription = "Random Audio") },
                    label = { Text("Random") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.Event, contentDescription = "Events") },
                    label = { Text("Events") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Star, contentDescription = "Celebrity") },
                    label = { Text("Celebrity") }
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.HeadsetMic, contentDescription = "Support") },
                    label = { Text("Support") }
                )
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> MatchmakingScreen()
                1 -> EventsScreen()
                2 -> CelebrityScreen()
                3 -> SupportScreen()
            }
        }
    }
}
